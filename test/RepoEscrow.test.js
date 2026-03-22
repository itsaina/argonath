/**
 * Tests Hardhat — RepoEscrow
 *
 * Couvre les deux modes (A: Lending Offer, B: Borrow Request) et tous les scénarios
 * critiques : happy path, cas limites, machine d'états complète (MarginCalled).
 *
 * Lancer : npx hardhat test test/RepoEscrow.test.js
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CASH_DECIMALS = 1_000_000n; // wMGA : 6 décimales
const BPS           = 10_000n;
const YEAR_SEC      = 365n * 24n * 3600n;
const MARGIN_CALL_GRACE = 4 * 3600; // 4h en secondes

function toWMGA(mga)  { return BigInt(mga) * CASH_DECIMALS; }
function fromWMGA(w)  { return Number(w) / Number(CASH_DECIMALS); }

/** Calcule le collatéral requis (même formule que le contrat) */
function calcCollateral(cashAmount, haircutBps) {
  const denom = (BPS - BigInt(haircutBps)) * CASH_DECIMALS;
  return (BigInt(cashAmount) * BPS + denom - 1n) / denom;
}

/** Calcule le remboursement ACT/365 */
function calcRepay(cashAmount, rateBps, durationSec) {
  const interest = BigInt(cashAmount) * BigInt(rateBps) * BigInt(durationSec)
    / (BPS * YEAR_SEC);
  return BigInt(cashAmount) + interest;
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe("RepoEscrow", function () {
  let deployer, lender, borrower, thirdParty;
  let mockCash, bondToken, bondMetadata, repo;

  // Maturité des bonds : 1 an dans le futur par défaut
  const BOND_MATURITY_OFFSET = 365 * 24 * 3600;

  beforeEach(async () => {
    [deployer, lender, borrower, thirdParty] = await ethers.getSigners();

    // Déployer MockCash (wMGA)
    const MockCash = await ethers.getContractFactory("MockCash");
    mockCash = await MockCash.deploy();

    // Déployer BondToken (ARGN)
    const BondToken = await ethers.getContractFactory("BondToken");
    bondToken = await BondToken.deploy();

    // Déployer BondMetadata
    const BondMetadata = await ethers.getContractFactory("BondMetadata");
    bondMetadata = await BondMetadata.deploy();

    // Déployer RepoEscrow
    const RepoEscrow = await ethers.getContractFactory("RepoEscrow");
    repo = await RepoEscrow.deploy(
      await bondToken.getAddress(),
      await mockCash.getAddress(),
      await bondMetadata.getAddress()
    );

    // Mint wMGA au prêteur
    await mockCash.mint(lender.address, toWMGA(1_000_000));
    // Mint ARGN à l'emprunteur (normalement via ClaimRegistry, ici direct pour les tests)
    await bondToken.mint(borrower.address, 10_000);

    // Enregistrer la maturité des bonds de l'emprunteur (1 an dans le futur)
    const now = await time.latest();
    await bondMetadata.setMaturity(borrower.address, now + BOND_MATURITY_OFFSET);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE A — LENDING OFFER
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Mode A — Lending Offer", function () {

    describe("createLendingOffer", function () {
      it("verrouille les wMGA du prêteur et émet LendingOfferCreated", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);

        await expect(
          repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400)
        )
          .to.emit(repo, "LendingOfferCreated")
          .withArgs(0, lender.address, cash, 1000, 800, 7 * 86400);

        expect(await mockCash.balanceOf(await repo.getAddress())).to.equal(cash);
        const offer = await repo.offers(0);
        expect(offer.status).to.equal(0); // Open
        expect(offer.lender).to.equal(lender.address);
      });

      it("rejette si cash = 0", async () => {
        await expect(
          repo.connect(lender).createLendingOffer(0, 800, 1000, 7 * 86400)
        ).to.be.revertedWith("RepoEscrow: cash must be > 0");
      });

      it("rejette si rate = 0", async () => {
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1000));
        await expect(
          repo.connect(lender).createLendingOffer(toWMGA(1000), 0, 1000, 7 * 86400)
        ).to.be.revertedWith("RepoEscrow: rate must be > 0");
      });

      it("rejette si haircut >= 100%", async () => {
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1000));
        await expect(
          repo.connect(lender).createLendingOffer(toWMGA(1000), 800, 10000, 7 * 86400)
        ).to.be.revertedWith("RepoEscrow: haircut must be < 100%");
      });

      it("rejette si durée > 364 jours", async () => {
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1000));
        await expect(
          repo.connect(lender).createLendingOffer(toWMGA(1000), 800, 1000, 365 * 86400)
        ).to.be.revertedWith("RepoEscrow: duration too long (max 364 days)");
      });
    });

    describe("collateralRequired", function () {
      it("calcule correctement avec haircut 10% (1000 bps)", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);

        const collatOnChain = await repo.collateralRequired(0);
        const expected = calcCollateral(cash, 1000);
        expect(collatOnChain).to.equal(expected);
        // 100 000 MGA / 0.9 = 111 112 ARGN (arrondi au supérieur)
        expect(collatOnChain).to.equal(111112n);
      });

      it("calcule correctement avec haircut 0%", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 0, 7 * 86400);

        const collatOnChain = await repo.collateralRequired(0);
        // 100 000 MGA / 1 = 100 000 ARGN
        expect(collatOnChain).to.equal(100_000n);
      });

      it("calcule correctement avec haircut 50%", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 5000, 7 * 86400);

        const collatOnChain = await repo.collateralRequired(0);
        // 100 000 MGA / 0.5 = 200 000 ARGN
        expect(collatOnChain).to.equal(200_000n);
      });
    });

    describe("accept", function () {
      beforeEach(async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);
      });

      it("flow happy path : accept transfère wMGA au borrower et ARGN en escrow", async () => {
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.connect(borrower).approve(await repo.getAddress(), collatNeeded);

        const cashBefore = await mockCash.balanceOf(borrower.address);
        await expect(repo.connect(borrower).accept(0))
          .to.emit(repo, "OfferAccepted")
          .withArgs(0, borrower.address, collatNeeded, anyValue(), anyValue());

        expect(await mockCash.balanceOf(borrower.address)).to.equal(cashBefore + toWMGA(100_000));
        expect(await bondToken.balanceOf(await repo.getAddress())).to.equal(collatNeeded);

        const offer = await repo.offers(0);
        expect(offer.status).to.equal(1); // Active
        expect(offer.borrower).to.equal(borrower.address);
      });

      it("rejette si le lender essaie d'accepter sa propre offre", async () => {
        await bondToken.mint(lender.address, 200_000);
        await bondToken.connect(lender).approve(await repo.getAddress(), 200_000);
        await expect(repo.connect(lender).accept(0))
          .to.be.revertedWith("RepoEscrow: lender cannot be borrower");
      });

      it("rejette si aucune maturité de bond enregistrée", async () => {
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.mint(thirdParty.address, collatNeeded);
        await bondToken.connect(thirdParty).approve(await repo.getAddress(), collatNeeded);
        // thirdParty n'a pas de maturité enregistrée dans BondMetadata
        await expect(repo.connect(thirdParty).accept(0))
          .to.be.revertedWith("RepoEscrow: no valid bond maturity registered");
      });

      it("rejette si la maturité du bond est trop proche (repo dépasserait la maturité)", async () => {
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.mint(thirdParty.address, collatNeeded);
        await bondToken.connect(thirdParty).approve(await repo.getAddress(), collatNeeded);
        // Maturité dans 3 jours seulement, durée du repo = 7 jours
        const now = await time.latest();
        await bondMetadata.setMaturity(thirdParty.address, now + 3 * 86400);
        await expect(repo.connect(thirdParty).accept(0))
          .to.be.revertedWith("RepoEscrow: repo would outlast bond maturity");
      });
    });

    describe("repay", function () {
      beforeEach(async () => {
        // Créer et accepter une offre 7 jours, 8% annuel, haircut 10%
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.connect(borrower).approve(await repo.getAddress(), collatNeeded);
        await repo.connect(borrower).accept(0);
        // Mint wMGA au borrower pour le remboursement (il a reçu les 100 000 wMGA)
        // Il doit rembourser capital + intérêts
        const total = await repo.repayAmount(0);
        await mockCash.mint(borrower.address, total); // s'assurer qu'il a assez
      });

      it("happy path : remboursement correct et ARGN restitué", async () => {
        const total = await repo.repayAmount(0);
        const collatBefore = await bondToken.balanceOf(borrower.address);

        await mockCash.connect(borrower).approve(await repo.getAddress(), total);
        await expect(repo.connect(borrower).repay(0))
          .to.emit(repo, "OfferRepaid")
          .withArgs(0, total);

        const offer = await repo.offers(0);
        expect(offer.status).to.equal(3); // Repaid
        // Borrower récupère ses ARGN
        expect(await bondToken.balanceOf(borrower.address)).to.be.gt(collatBefore);
      });

      it("vérifie le calcul ACT/365", async () => {
        const offer = await repo.offers(0);
        const expectedRepay = calcRepay(offer.cashAmount, offer.repoRateBps, offer.durationSeconds);
        const onChainRepay = await repo.repayAmount(0);
        expect(onChainRepay).to.equal(expectedRepay);
      });

      it("rejette si non-borrower tente de rembourser", async () => {
        const total = await repo.repayAmount(0);
        await mockCash.connect(lender).approve(await repo.getAddress(), total);
        await expect(repo.connect(lender).repay(0))
          .to.be.revertedWith("RepoEscrow: only borrower can repay");
      });
    });

    describe("triggerMarginCall + claimDefault", function () {
      beforeEach(async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.connect(borrower).approve(await repo.getAddress(), collatNeeded);
        await repo.connect(borrower).accept(0);
      });

      it("rejette triggerMarginCall avant maturité", async () => {
        await expect(repo.connect(lender).triggerMarginCall(0))
          .to.be.revertedWith("RepoEscrow: repo not matured yet");
      });

      it("rejette triggerMarginCall par non-lender", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity));
        await expect(repo.connect(borrower).triggerMarginCall(0))
          .to.be.revertedWith("RepoEscrow: only lender can trigger margin call");
      });

      it("flow complet : triggerMarginCall → MarginCalled → borrower repay", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity));

        await expect(repo.connect(lender).triggerMarginCall(0))
          .to.emit(repo, "MarginCallTriggered");

        const offerAfter = await repo.offers(0);
        expect(offerAfter.status).to.equal(2); // MarginCalled
        expect(offerAfter.marginCallDeadline).to.be.gt(0);

        // Borrower rembourse pendant la fenêtre
        const total = await repo.repayAmount(0);
        await mockCash.mint(borrower.address, total);
        await mockCash.connect(borrower).approve(await repo.getAddress(), total);
        await repo.connect(borrower).repay(0);

        expect((await repo.offers(0)).status).to.equal(3); // Repaid
      });

      it("flow défaut : triggerMarginCall → deadline expiré → lender claimDefault", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity));
        await repo.connect(lender).triggerMarginCall(0);

        const offerMC = await repo.offers(0);
        // Avancer après la deadline du margin call (4h)
        await time.increaseTo(Number(offerMC.marginCallDeadline) + 1);

        const collatBefore = await bondToken.balanceOf(lender.address);
        await expect(repo.connect(lender).claimDefault(0))
          .to.emit(repo, "DefaultClaimed")
          .withArgs(0, lender.address);

        expect((await repo.offers(0)).status).to.equal(4); // Defaulted
        expect(await bondToken.balanceOf(lender.address)).to.be.gt(collatBefore);
      });

      it("rejette claimDefault sans triggerMarginCall préalable", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity) + MARGIN_CALL_GRACE + 1);
        await expect(repo.connect(lender).claimDefault(0))
          .to.be.revertedWith("RepoEscrow: must trigger margin call first");
      });

      it("rejette claimDefault pendant la fenêtre de margin call", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity));
        await repo.connect(lender).triggerMarginCall(0);
        // Tenter claimDefault immédiatement (fenêtre encore active)
        await expect(repo.connect(lender).claimDefault(0))
          .to.be.revertedWith("RepoEscrow: margin call grace still active");
      });

      it("rejette repay après la deadline du margin call", async () => {
        const offer = await repo.offers(0);
        await time.increaseTo(Number(offer.maturity));
        await repo.connect(lender).triggerMarginCall(0);
        const offerMC = await repo.offers(0);
        await time.increaseTo(Number(offerMC.marginCallDeadline) + 1);

        const total = await repo.repayAmount(0);
        await mockCash.mint(borrower.address, total);
        await mockCash.connect(borrower).approve(await repo.getAddress(), total);
        await expect(repo.connect(borrower).repay(0))
          .to.be.revertedWith("RepoEscrow: margin call deadline passed");
      });
    });

    describe("cancelOffer", function () {
      it("restitue les wMGA au lender si Open", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);

        const balBefore = await mockCash.balanceOf(lender.address);
        await repo.connect(lender).cancelOffer(0);
        expect(await mockCash.balanceOf(lender.address)).to.equal(balBefore + cash);
        expect((await repo.offers(0)).status).to.equal(5); // Cancelled
      });

      it("rejette cancelOffer si l'offre est Active", async () => {
        const cash = toWMGA(100_000);
        await mockCash.connect(lender).approve(await repo.getAddress(), cash);
        await repo.connect(lender).createLendingOffer(cash, 800, 1000, 7 * 86400);
        const collatNeeded = await repo.collateralRequired(0);
        await bondToken.connect(borrower).approve(await repo.getAddress(), collatNeeded);
        await repo.connect(borrower).accept(0);

        await expect(repo.connect(lender).cancelOffer(0))
          .to.be.revertedWith("RepoEscrow: offer not open");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE B — BORROW REQUEST
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Mode B — Borrow Request", function () {

    describe("createBorrowRequest", function () {
      it("verrouille les ARGN et émet BorrowRequestCreated", async () => {
        const collat = 1000n;
        await bondToken.connect(borrower).approve(await repo.getAddress(), collat);

        await expect(
          repo.connect(borrower).createBorrowRequest(collat, toWMGA(900), 800, 7 * 86400)
        )
          .to.emit(repo, "BorrowRequestCreated")
          .withArgs(0, borrower.address, collat, toWMGA(900), 800, 7 * 86400, anyValue());

        expect(await bondToken.balanceOf(await repo.getAddress())).to.equal(collat);
        const req = await repo.borrowRequests(0);
        expect(req.status).to.equal(0); // Open
        expect(req.acceptedLender).to.equal(ethers.ZeroAddress);
      });

      it("rejette si maturité du bond insuffisante", async () => {
        const collatNeeded = 1000n;
        await bondToken.mint(thirdParty.address, collatNeeded);
        await bondToken.connect(thirdParty).approve(await repo.getAddress(), collatNeeded);
        // Pas de maturité enregistrée pour thirdParty
        await expect(
          repo.connect(thirdParty).createBorrowRequest(collatNeeded, toWMGA(900), 800, 7 * 86400)
        ).to.be.revertedWith("RepoEscrow: no valid bond maturity registered");
      });
    });

    describe("setAcceptedLender", function () {
      beforeEach(async () => {
        await bondToken.connect(borrower).approve(await repo.getAddress(), 1000);
        await repo.connect(borrower).createBorrowRequest(1000, toWMGA(900), 800, 7 * 86400);
      });

      it("whiteliste le lender et émet LenderAccepted", async () => {
        await expect(repo.connect(borrower).setAcceptedLender(0, lender.address))
          .to.emit(repo, "LenderAccepted")
          .withArgs(0, lender.address);

        const req = await repo.borrowRequests(0);
        expect(req.acceptedLender).to.equal(lender.address);
      });

      it("rejette si appelé par non-borrower", async () => {
        await expect(repo.connect(lender).setAcceptedLender(0, lender.address))
          .to.be.revertedWith("RepoEscrow: only borrower can set accepted lender");
      });

      it("rejette si lender = address(0)", async () => {
        await expect(repo.connect(borrower).setAcceptedLender(0, ethers.ZeroAddress))
          .to.be.revertedWith("RepoEscrow: invalid lender address");
      });

      it("rejette si lender = borrower", async () => {
        await expect(repo.connect(borrower).setAcceptedLender(0, borrower.address))
          .to.be.revertedWith("RepoEscrow: lender cannot be borrower");
      });
    });

    describe("fundRequest", function () {
      beforeEach(async () => {
        await bondToken.connect(borrower).approve(await repo.getAddress(), 1000);
        await repo.connect(borrower).createBorrowRequest(1000, toWMGA(900), 800, 7 * 86400);
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1_000_000));
      });

      it("happy path : prêteur finance, wMGA envoyés au borrower", async () => {
        const cashBefore = await mockCash.balanceOf(borrower.address);
        await expect(
          repo.connect(lender).fundRequest(0, toWMGA(900), 800)
        )
          .to.emit(repo, "RequestFunded")
          .withArgs(0, lender.address, toWMGA(900), 800, anyValue());

        expect(await mockCash.balanceOf(borrower.address)).to.equal(cashBefore + toWMGA(900));
        const req = await repo.borrowRequests(0);
        expect(req.status).to.equal(1); // Active
        expect(req.lender).to.equal(lender.address);
      });

      it("rejette si rate > maxRateBps", async () => {
        await expect(
          repo.connect(lender).fundRequest(0, toWMGA(900), 900) // max est 800
        ).to.be.revertedWith("RepoEscrow: rate exceeds borrower maximum");
      });

      it("rejette si cash < desiredCash", async () => {
        await expect(
          repo.connect(lender).fundRequest(0, toWMGA(800), 800) // desired est 900
        ).to.be.revertedWith("RepoEscrow: insufficient cash offered");
      });

      it("rejette si borrower tente de se financer lui-même", async () => {
        await mockCash.mint(borrower.address, toWMGA(1_000_000));
        await mockCash.connect(borrower).approve(await repo.getAddress(), toWMGA(1_000_000));
        await expect(
          repo.connect(borrower).fundRequest(0, toWMGA(900), 800)
        ).to.be.revertedWith("RepoEscrow: borrower cannot lend");
      });

      it("bloque un tiers si setAcceptedLender a été appelé", async () => {
        await repo.connect(borrower).setAcceptedLender(0, lender.address);

        await mockCash.mint(thirdParty.address, toWMGA(1_000_000));
        await mockCash.connect(thirdParty).approve(await repo.getAddress(), toWMGA(1_000_000));
        await expect(
          repo.connect(thirdParty).fundRequest(0, toWMGA(900), 800)
        ).to.be.revertedWith("RepoEscrow: lender not accepted by borrower");
      });

      it("autorise le lender accepté après setAcceptedLender", async () => {
        await repo.connect(borrower).setAcceptedLender(0, lender.address);
        await expect(
          repo.connect(lender).fundRequest(0, toWMGA(900), 800)
        ).to.not.be.reverted;
      });

      it("autorise n'importe qui si acceptedLender = address(0)", async () => {
        await mockCash.mint(thirdParty.address, toWMGA(1_000_000));
        await mockCash.connect(thirdParty).approve(await repo.getAddress(), toWMGA(1_000_000));
        await expect(
          repo.connect(thirdParty).fundRequest(0, toWMGA(900), 800)
        ).to.not.be.reverted;
      });
    });

    describe("repayRequest + triggerMarginCallRequest + claimDefaultRequest", function () {
      beforeEach(async () => {
        await bondToken.connect(borrower).approve(await repo.getAddress(), 1000);
        await repo.connect(borrower).createBorrowRequest(1000, toWMGA(900), 800, 7 * 86400);
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1_000_000));
        await repo.connect(lender).fundRequest(0, toWMGA(900), 800);
      });

      it("repayRequest happy path", async () => {
        const total = await repo.repayRequestAmount(0);
        await mockCash.mint(borrower.address, total);
        await mockCash.connect(borrower).approve(await repo.getAddress(), total);

        await expect(repo.connect(borrower).repayRequest(0))
          .to.emit(repo, "RequestRepaid")
          .withArgs(0, total);

        expect((await repo.borrowRequests(0)).status).to.equal(3); // Repaid
      });

      it("flow complet margin call → repayment pendant fenêtre", async () => {
        const req = await repo.borrowRequests(0);
        await time.increaseTo(Number(req.maturity));

        await repo.connect(lender).triggerMarginCallRequest(0);
        expect((await repo.borrowRequests(0)).status).to.equal(2); // MarginCalled

        const total = await repo.repayRequestAmount(0);
        await mockCash.mint(borrower.address, total);
        await mockCash.connect(borrower).approve(await repo.getAddress(), total);
        await repo.connect(borrower).repayRequest(0);

        expect((await repo.borrowRequests(0)).status).to.equal(3); // Repaid
      });

      it("flow défaut : triggerMarginCallRequest → deadline → claimDefaultRequest", async () => {
        const req = await repo.borrowRequests(0);
        await time.increaseTo(Number(req.maturity));
        await repo.connect(lender).triggerMarginCallRequest(0);

        const reqMC = await repo.borrowRequests(0);
        await time.increaseTo(Number(reqMC.marginCallDeadline) + 1);

        const collatBefore = await bondToken.balanceOf(lender.address);
        await repo.connect(lender).claimDefaultRequest(0);

        expect((await repo.borrowRequests(0)).status).to.equal(4); // Defaulted
        expect(await bondToken.balanceOf(lender.address)).to.be.gt(collatBefore);
      });

      it("rejette triggerMarginCallRequest avant maturité", async () => {
        await expect(repo.connect(lender).triggerMarginCallRequest(0))
          .to.be.revertedWith("RepoEscrow: repo not matured yet");
      });

      it("rejette claimDefaultRequest sans trigger préalable", async () => {
        const req = await repo.borrowRequests(0);
        await time.increaseTo(Number(req.maturity) + MARGIN_CALL_GRACE + 1);
        await expect(repo.connect(lender).claimDefaultRequest(0))
          .to.be.revertedWith("RepoEscrow: must trigger margin call first");
      });
    });

    describe("cancelRequest", function () {
      it("restitue les ARGN au borrower si Open", async () => {
        await bondToken.connect(borrower).approve(await repo.getAddress(), 1000);
        await repo.connect(borrower).createBorrowRequest(1000, toWMGA(900), 800, 7 * 86400);

        const balBefore = await bondToken.balanceOf(borrower.address);
        await repo.connect(borrower).cancelRequest(0);
        expect(await bondToken.balanceOf(borrower.address)).to.equal(balBefore + 1000n);
        expect((await repo.borrowRequests(0)).status).to.equal(5); // Cancelled
      });

      it("rejette cancelRequest si Active", async () => {
        await bondToken.connect(borrower).approve(await repo.getAddress(), 1000);
        await repo.connect(borrower).createBorrowRequest(1000, toWMGA(900), 800, 7 * 86400);
        await mockCash.connect(lender).approve(await repo.getAddress(), toWMGA(1_000_000));
        await repo.connect(lender).fundRequest(0, toWMGA(900), 800);

        await expect(repo.connect(borrower).cancelRequest(0))
          .to.be.revertedWith("RepoEscrow: request not open");
      });
    });
  });
});

// Helper pour chai — accepte n'importe quelle valeur dans emit assertions
function anyValue() {
  return { asymmetricMatch: () => true };
}
