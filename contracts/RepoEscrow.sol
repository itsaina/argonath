// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Interface minimale vers BondMetadata
interface IBondMetadata {
    function getMaturity(address wallet) external view returns (uint256);
}

/// @title RepoEscrow — Séquestre pour opérations de repo bilatérales
///
/// Deux modes :
///  A) Lending Offer  : prêteur bloque wMGA + fixe termes → emprunteur accepte (DvP atomique)
///  B) Borrow Request : emprunteur bloque ARGN + définit besoins → prêteurs proposent → DvP à confirmation
///
/// Règles métier :
///  - GRACE_PERIOD (24h) : fenêtre après maturity pendant laquelle le borrower peut encore rembourser,
///    et pendant laquelle le lender NE PEUT PAS encore réclamer le défaut.
///  - MAX_REPO_DURATION (364 jours) : durée maximale d'une opération repo.
///  - bondMaturityTimestamp : lu depuis BondMetadata (renseigné par le dépositaire au mint) —
///    le repo (+ grace period) ne peut pas dépasser la maturité des bonds mis en collatéral.
///
/// Hypothèse PoC : 1 ARGN = 1 MGA nominal, wMGA a 6 décimales (1 MGA = 1e6 wMGA units).
contract RepoEscrow {

    IERC20        public bondToken;    // ARGN (ERC-20 / HTS via HIP-218)
    IERC20        public cashToken;    // wMGA (ERC-20, 6 décimales)
    IBondMetadata public bondMetadata; // Registre de maturités — renseigné par le dépositaire

    uint256 public constant CASH_DECIMALS     = 1e6;
    uint256 public constant GRACE_PERIOD      = 24 hours;
    uint256 public constant MAX_REPO_DURATION = 364 days;

    enum Status { Open, Active, Repaid, Defaulted, Cancelled }

    // ─── Mode A : Lending Offer ─────────────────────────────────────────────────
    struct RepoOffer {
        address lender;
        uint256 cashAmount;           // wMGA bloqués (en unités wMGA)
        uint256 haircut;              // décote en bps (ex: 1000 = 10%)
        uint256 repoRateBps;          // taux annualisé en bps
        uint256 durationSeconds;
        address borrower;
        uint256 collateralAmount;     // ARGN apportés (0 si Open)
        uint256 maturity;
        uint256 bondMaturityTimestamp; // lu depuis BondMetadata au moment d'accept()
        Status  status;
    }

    uint256 public offerCount;
    mapping(uint256 => RepoOffer) public offers;

    // ─── Mode B : Borrow Request ────────────────────────────────────────────────
    struct BorrowRequest {
        address borrower;
        uint256 collateralLocked;      // ARGN bloqués par l'emprunteur
        uint256 desiredCash;           // wMGA souhaités (en unités wMGA)
        uint256 maxRateBps;            // taux repo max acceptable
        uint256 durationSeconds;
        uint256 bondMaturityTimestamp; // lu depuis BondMetadata au moment de createBorrowRequest()
        address lender;                // 0x0 jusqu'au financement
        uint256 actualCash;            // wMGA reçus lors du financement
        uint256 actualRateBps;         // taux réel convenu
        uint256 maturity;
        Status  status;
    }

    uint256 public requestCount;
    mapping(uint256 => BorrowRequest) public borrowRequests;

    // ─── Events ─────────────────────────────────────────────────────────────────
    event LendingOfferCreated(uint256 indexed offerId, address indexed lender, uint256 cashAmount, uint256 haircut, uint256 repoRateBps, uint256 durationSeconds);
    event OfferAccepted(uint256 indexed offerId, address indexed borrower, uint256 collateralAmount, uint256 maturity, uint256 bondMaturityTimestamp);
    event OfferRepaid(uint256 indexed offerId, uint256 repayAmount);
    event DefaultClaimed(uint256 indexed offerId, address indexed lender);
    event OfferCancelled(uint256 indexed offerId);

    event BorrowRequestCreated(uint256 indexed requestId, address indexed borrower, uint256 collateralLocked, uint256 desiredCash, uint256 maxRateBps, uint256 durationSeconds, uint256 bondMaturityTimestamp);
    event RequestFunded(uint256 indexed requestId, address indexed lender, uint256 actualCash, uint256 actualRateBps, uint256 maturity);
    event RequestRepaid(uint256 indexed requestId, uint256 repayAmount);
    event RequestDefaultClaimed(uint256 indexed requestId, address indexed lender);
    event RequestCancelled(uint256 indexed requestId);

    constructor(address _bondToken, address _cashToken, address _bondMetadata) {
        bondToken    = IERC20(_bondToken);
        cashToken    = IERC20(_cashToken);
        bondMetadata = IBondMetadata(_bondMetadata);
    }

    /// @notice Associe ce contrat au token ARGN (HTS) via le HTS Precompile.
    ///         Doit être appelé une fois après déploiement sur Hedera.
    function associateWithBondToken() external {
        address(0x167).call(
            abi.encodeWithSignature("associateToken(address,address)", address(this), address(bondToken))
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODE A — LENDING OFFER
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Le prêteur crée une offre de liquidité en bloquant ses wMGA.
    function createLendingOffer(
        uint256 cashAmount,
        uint256 repoRateBps,
        uint256 haircut,
        uint256 durationSeconds
    ) external returns (uint256 offerId) {
        require(cashAmount > 0,                          "RepoEscrow: cash must be > 0");
        require(repoRateBps > 0,                         "RepoEscrow: rate must be > 0");
        require(haircut < 10000,                         "RepoEscrow: haircut must be < 100%");
        require(durationSeconds > 0,                     "RepoEscrow: duration must be > 0");
        require(durationSeconds <= MAX_REPO_DURATION,    "RepoEscrow: duration too long (max 364 days)");

        require(
            cashToken.transferFrom(msg.sender, address(this), cashAmount),
            "RepoEscrow: cash transfer failed"
        );

        offerId = offerCount++;
        offers[offerId] = RepoOffer({
            lender:               msg.sender,
            cashAmount:           cashAmount,
            haircut:              haircut,
            repoRateBps:          repoRateBps,
            durationSeconds:      durationSeconds,
            borrower:             address(0),
            collateralAmount:     0,
            maturity:             0,
            bondMaturityTimestamp: 0,
            status:               Status.Open
        });

        emit LendingOfferCreated(offerId, msg.sender, cashAmount, haircut, repoRateBps, durationSeconds);
    }

    /// @notice Calcule le collatéral ARGN requis pour une offre.
    function collateralRequired(uint256 offerId) public view returns (uint256) {
        RepoOffer storage offer = offers[offerId];
        require(offer.cashAmount > 0, "RepoEscrow: offer not found");
        uint256 denom = (10000 - offer.haircut) * CASH_DECIMALS;
        return (offer.cashAmount * 10000 + denom - 1) / denom;
    }

    /// @notice L'emprunteur accepte l'offre — DvP atomique.
    ///         La maturité des bonds est lue depuis BondMetadata (renseignée par le dépositaire).
    function accept(uint256 offerId) external {
        RepoOffer storage offer = offers[offerId];
        require(offer.status == Status.Open,    "RepoEscrow: offer not open");
        require(msg.sender != offer.lender,     "RepoEscrow: lender cannot be borrower");

        uint256 bondMaturityTs = bondMetadata.getMaturity(msg.sender);
        require(bondMaturityTs > block.timestamp, "RepoEscrow: no valid bond maturity registered");
        require(
            block.timestamp + offer.durationSeconds + GRACE_PERIOD <= bondMaturityTs,
            "RepoEscrow: repo would outlast bond maturity"
        );

        uint256 collatNeeded = collateralRequired(offerId);

        require(
            bondToken.transferFrom(msg.sender, address(this), collatNeeded),
            "RepoEscrow: collateral transfer failed"
        );
        require(
            cashToken.transfer(msg.sender, offer.cashAmount),
            "RepoEscrow: cash release failed"
        );

        offer.borrower             = msg.sender;
        offer.collateralAmount     = collatNeeded;
        offer.maturity             = block.timestamp + offer.durationSeconds;
        offer.bondMaturityTimestamp = bondMaturityTs;
        offer.status               = Status.Active;

        emit OfferAccepted(offerId, msg.sender, collatNeeded, offer.maturity, bondMaturityTs);
    }

    /// @notice Montant de remboursement pour une offre (capital + intérêts ACT/365).
    function repayAmount(uint256 offerId) public view returns (uint256) {
        RepoOffer storage offer = offers[offerId];
        uint256 interest = (offer.cashAmount * offer.repoRateBps * offer.durationSeconds)
            / (10_000 * 365 days);
        return offer.cashAmount + interest;
    }

    /// @notice L'emprunteur rembourse et récupère ses ARGN.
    ///         Autorisé jusqu'à maturity + GRACE_PERIOD.
    function repay(uint256 offerId) external {
        RepoOffer storage offer = offers[offerId];
        require(offer.status == Status.Active,                     "RepoEscrow: offer not active");
        require(msg.sender == offer.borrower,                      "RepoEscrow: only borrower can repay");
        require(block.timestamp <= offer.maturity + GRACE_PERIOD,  "RepoEscrow: grace period expired - lender may claim default");

        uint256 total = repayAmount(offerId);

        require(
            cashToken.transferFrom(msg.sender, offer.lender, total),
            "RepoEscrow: repayment transfer failed"
        );
        require(
            bondToken.transfer(offer.borrower, offer.collateralAmount),
            "RepoEscrow: collateral restitution failed"
        );

        offer.status = Status.Repaid;
        emit OfferRepaid(offerId, total);
    }

    /// @notice Le prêteur réclame les ARGN en cas de défaut.
    ///         Uniquement après maturity + GRACE_PERIOD.
    function claimDefault(uint256 offerId) external {
        RepoOffer storage offer = offers[offerId];
        require(offer.status == Status.Active,                     "RepoEscrow: offer not active");
        require(msg.sender == offer.lender,                        "RepoEscrow: only lender can claim default");
        require(block.timestamp > offer.maturity + GRACE_PERIOD,   "RepoEscrow: grace period still active - wait 24h after maturity");

        require(
            bondToken.transfer(offer.lender, offer.collateralAmount),
            "RepoEscrow: collateral transfer failed"
        );

        offer.status = Status.Defaulted;
        emit DefaultClaimed(offerId, offer.lender);
    }

    /// @notice Le prêteur annule son offre (uniquement si Open).
    function cancelOffer(uint256 offerId) external {
        RepoOffer storage offer = offers[offerId];
        require(offer.status == Status.Open,   "RepoEscrow: offer not open");
        require(msg.sender == offer.lender,    "RepoEscrow: only lender can cancel");

        require(
            cashToken.transfer(offer.lender, offer.cashAmount),
            "RepoEscrow: cash restitution failed"
        );

        offer.status = Status.Cancelled;
        emit OfferCancelled(offerId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODE B — BORROW REQUEST
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice L'emprunteur crée une demande en bloquant son collatéral ARGN.
    ///         La maturité des bonds est lue depuis BondMetadata — le user ne peut pas la falsifier.
    function createBorrowRequest(
        uint256 collateralAmount,
        uint256 desiredCash,
        uint256 maxRateBps,
        uint256 durationSeconds
    ) external returns (uint256 requestId) {
        require(collateralAmount > 0,                 "RepoEscrow: collateral must be > 0");
        require(desiredCash > 0,                      "RepoEscrow: desiredCash must be > 0");
        require(maxRateBps > 0,                       "RepoEscrow: maxRate must be > 0");
        require(durationSeconds > 0,                  "RepoEscrow: duration must be > 0");
        require(durationSeconds <= MAX_REPO_DURATION, "RepoEscrow: duration too long (max 364 days)");

        uint256 bondMaturityTs = bondMetadata.getMaturity(msg.sender);
        require(bondMaturityTs > block.timestamp, "RepoEscrow: no valid bond maturity registered");
        require(
            block.timestamp + durationSeconds + GRACE_PERIOD <= bondMaturityTs,
            "RepoEscrow: repo would outlast bond maturity"
        );

        require(
            bondToken.transferFrom(msg.sender, address(this), collateralAmount),
            "RepoEscrow: collateral transfer failed"
        );

        requestId = requestCount++;
        borrowRequests[requestId] = BorrowRequest({
            borrower:             msg.sender,
            collateralLocked:     collateralAmount,
            desiredCash:          desiredCash,
            maxRateBps:           maxRateBps,
            durationSeconds:      durationSeconds,
            bondMaturityTimestamp: bondMaturityTs,
            lender:               address(0),
            actualCash:           0,
            actualRateBps:        0,
            maturity:             0,
            status:               Status.Open
        });

        emit BorrowRequestCreated(requestId, msg.sender, collateralAmount, desiredCash, maxRateBps, durationSeconds, bondMaturityTs);
    }

    /// @notice Le prêteur finance la demande après accord off-chain.
    function fundRequest(
        uint256 requestId,
        uint256 actualCash,
        uint256 actualRateBps
    ) external {
        BorrowRequest storage req = borrowRequests[requestId];
        require(req.status == Status.Open,           "RepoEscrow: request not open");
        require(msg.sender != req.borrower,          "RepoEscrow: borrower cannot lend");
        require(actualCash >= req.desiredCash,       "RepoEscrow: insufficient cash offered");
        require(actualRateBps <= req.maxRateBps,     "RepoEscrow: rate exceeds borrower maximum");

        require(
            cashToken.transferFrom(msg.sender, req.borrower, actualCash),
            "RepoEscrow: cash transfer failed"
        );

        req.lender        = msg.sender;
        req.actualCash    = actualCash;
        req.actualRateBps = actualRateBps;
        req.maturity      = block.timestamp + req.durationSeconds;
        req.status        = Status.Active;

        emit RequestFunded(requestId, msg.sender, actualCash, actualRateBps, req.maturity);
    }

    /// @notice Montant de remboursement pour une demande (capital + intérêts ACT/365).
    function repayRequestAmount(uint256 requestId) public view returns (uint256) {
        BorrowRequest storage req = borrowRequests[requestId];
        uint256 interest = (req.actualCash * req.actualRateBps * req.durationSeconds)
            / (10_000 * 365 days);
        return req.actualCash + interest;
    }

    /// @notice L'emprunteur rembourse la demande et récupère ses ARGN.
    function repayRequest(uint256 requestId) external {
        BorrowRequest storage req = borrowRequests[requestId];
        require(req.status == Status.Active,                     "RepoEscrow: request not active");
        require(msg.sender == req.borrower,                      "RepoEscrow: only borrower can repay");
        require(block.timestamp <= req.maturity + GRACE_PERIOD,  "RepoEscrow: grace period expired - lender may claim default");

        uint256 total = repayRequestAmount(requestId);

        require(
            cashToken.transferFrom(msg.sender, req.lender, total),
            "RepoEscrow: repayment transfer failed"
        );
        require(
            bondToken.transfer(req.borrower, req.collateralLocked),
            "RepoEscrow: collateral restitution failed"
        );

        req.status = Status.Repaid;
        emit RequestRepaid(requestId, total);
    }

    /// @notice Le prêteur réclame les ARGN en cas de défaut sur une demande.
    function claimDefaultRequest(uint256 requestId) external {
        BorrowRequest storage req = borrowRequests[requestId];
        require(req.status == Status.Active,                     "RepoEscrow: request not active");
        require(msg.sender == req.lender,                        "RepoEscrow: only lender can claim default");
        require(block.timestamp > req.maturity + GRACE_PERIOD,   "RepoEscrow: grace period still active - wait 24h after maturity");

        require(
            bondToken.transfer(req.lender, req.collateralLocked),
            "RepoEscrow: collateral transfer failed"
        );

        req.status = Status.Defaulted;
        emit RequestDefaultClaimed(requestId, req.lender);
    }

    /// @notice L'emprunteur annule sa demande (uniquement si Open) et récupère ses ARGN.
    function cancelRequest(uint256 requestId) external {
        BorrowRequest storage req = borrowRequests[requestId];
        require(req.status == Status.Open,   "RepoEscrow: request not open");
        require(msg.sender == req.borrower,  "RepoEscrow: only borrower can cancel");

        require(
            bondToken.transfer(req.borrower, req.collateralLocked),
            "RepoEscrow: collateral restitution failed"
        );

        req.status = Status.Cancelled;
        emit RequestCancelled(requestId);
    }
}
