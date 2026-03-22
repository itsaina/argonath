/**
 * Tests Hardhat — ClaimRegistry
 *
 * Couvre le cycle complet d'autorisation et de redeem des claims,
 * ainsi que tous les cas d'erreur critiques.
 *
 * Lancer : npx hardhat test test/ClaimRegistry.test.js
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Génère un claimId bytes32 deterministe à partir d'une chaîne (simule le backend) */
function makeClaimId(batchId) {
  return ethers.keccak256(ethers.toUtf8Bytes(batchId));
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe("ClaimRegistry", function () {
  let owner, investor, otherWallet;
  let registry;

  const BATCH_ID   = "BATCH-2026-001";
  const CLAIM_ID   = makeClaimId(BATCH_ID);
  const AMOUNT     = 1000; // 1000 ARGN

  beforeEach(async () => {
    [owner, investor, otherWallet] = await ethers.getSigners();

    const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
    registry = await ClaimRegistry.deploy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // authorize
  // ═══════════════════════════════════════════════════════════════════════════

  describe("authorize", function () {
    it("enregistre le wallet autorisé et émet ClaimAuthorized", async () => {
      await expect(registry.connect(owner).authorize(CLAIM_ID, investor.address))
        .to.emit(registry, "ClaimAuthorized")
        .withArgs(CLAIM_ID, investor.address);

      expect(await registry.authorizedWallet(CLAIM_ID)).to.equal(investor.address);
    });

    it("rejette si appelé par non-owner", async () => {
      await expect(registry.connect(investor).authorize(CLAIM_ID, investor.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("peut réautoriser un même claimId vers un wallet différent (correction depositary)", async () => {
      await registry.connect(owner).authorize(CLAIM_ID, investor.address);
      await registry.connect(owner).authorize(CLAIM_ID, otherWallet.address);
      expect(await registry.authorizedWallet(CLAIM_ID)).to.equal(otherWallet.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // redeem
  // ═══════════════════════════════════════════════════════════════════════════

  describe("redeem", function () {
    beforeEach(async () => {
      await registry.connect(owner).authorize(CLAIM_ID, investor.address);
    });

    it("happy path : redeem autorisé émet ClaimRedeemed et marque comme redeemed", async () => {
      await expect(registry.connect(investor).redeem(CLAIM_ID, AMOUNT))
        .to.emit(registry, "ClaimRedeemed")
        .withArgs(CLAIM_ID, investor.address, AMOUNT);

      expect(await registry.redeemed(CLAIM_ID)).to.be.true;
    });

    it("rejette si le wallet n'est pas autorisé", async () => {
      await expect(registry.connect(otherWallet).redeem(CLAIM_ID, AMOUNT))
        .to.be.revertedWith("ClaimRegistry: not authorized");
    });

    it("rejette le double redeem", async () => {
      await registry.connect(investor).redeem(CLAIM_ID, AMOUNT);
      await expect(registry.connect(investor).redeem(CLAIM_ID, AMOUNT))
        .to.be.revertedWith("ClaimRegistry: already redeemed");
    });

    it("rejette si aucune autorisation (wallet = 0x0)", async () => {
      const unknownClaimId = makeClaimId("BATCH-UNKNOWN");
      await expect(registry.connect(investor).redeem(unknownClaimId, AMOUNT))
        .to.be.revertedWith("ClaimRegistry: not authorized");
    });

    it("deux claims différents peuvent être redeemed indépendamment", async () => {
      const CLAIM_ID_2 = makeClaimId("BATCH-2026-002");
      await registry.connect(owner).authorize(CLAIM_ID_2, investor.address);

      await registry.connect(investor).redeem(CLAIM_ID, AMOUNT);
      // Le second claim n'est pas encore redeemed
      expect(await registry.redeemed(CLAIM_ID_2)).to.be.false;
      // Le second peut encore être redeemed
      await expect(registry.connect(investor).redeem(CLAIM_ID_2, AMOUNT)).to.not.be.reverted;
    });

    it("le même wallet peut redeem plusieurs claims distincts", async () => {
      const ids = ["BATCH-A", "BATCH-B", "BATCH-C"].map(makeClaimId);
      for (const id of ids) {
        await registry.connect(owner).authorize(id, investor.address);
        await expect(registry.connect(investor).redeem(id, AMOUNT)).to.not.be.reverted;
        expect(await registry.redeemed(id)).to.be.true;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Lecture des mappings
  // ═══════════════════════════════════════════════════════════════════════════

  describe("lecture d'état", function () {
    it("authorizedWallet retourne 0x0 si jamais autorisé", async () => {
      expect(await registry.authorizedWallet(makeClaimId("INEXISTANT")))
        .to.equal(ethers.ZeroAddress);
    });

    it("redeemed retourne false avant redeem", async () => {
      await registry.connect(owner).authorize(CLAIM_ID, investor.address);
      expect(await registry.redeemed(CLAIM_ID)).to.be.false;
    });

    it("redeemed retourne true après redeem", async () => {
      await registry.connect(owner).authorize(CLAIM_ID, investor.address);
      await registry.connect(investor).redeem(CLAIM_ID, AMOUNT);
      expect(await registry.redeemed(CLAIM_ID)).to.be.true;
    });
  });
});
