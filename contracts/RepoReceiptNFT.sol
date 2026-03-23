// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RepoReceiptNFT — Titre de propriété du collatéral en escrow
///
/// Minté au prêteur quand il finance un Borrow Request (fundRequest).
/// Brûlé automatiquement lors du remboursement ou du défaut.
/// tokenId = requestId (1 NFT par Borrow Request financé).
///
/// Seul le contrat RepoEscrow peut mint / burn.
///
/// ERC-721 minimal (pas d'OZ — incompatible avec Hedera Paris EVM à cause de mcopy).
contract RepoReceiptNFT {
    string public constant name     = "Argonath Repo Receipt";
    string public constant symbol   = "REPO-RCT";

    address public repoEscrow;

    struct ReceiptData {
        uint256 requestId;
        uint256 collateralAmount;   // ARGN bloqués en escrow
        address borrower;
        uint256 actualCash;         // wMGA prêtés
        uint256 actualRateBps;      // taux repo en bps
        uint256 maturity;           // timestamp de maturité
    }

    mapping(uint256 => ReceiptData) public receipts;
    mapping(uint256 => address)     public ownerOf;
    mapping(address => uint256)     public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ReceiptMinted(uint256 indexed tokenId, address indexed lender, uint256 collateralAmount);
    event ReceiptBurned(uint256 indexed tokenId);

    modifier onlyEscrow() {
        require(msg.sender == repoEscrow, "RepoReceiptNFT: caller is not RepoEscrow");
        _;
    }

    constructor(address _repoEscrow) {
        require(_repoEscrow != address(0), "RepoReceiptNFT: zero escrow address");
        repoEscrow = _repoEscrow;
    }

    /// @notice Mint un Repo Receipt au prêteur. Appelé par RepoEscrow.fundRequest().
    function mint(address to, ReceiptData calldata data) external onlyEscrow {
        require(to != address(0), "RepoReceiptNFT: mint to zero");
        require(ownerOf[data.requestId] == address(0), "RepoReceiptNFT: already minted");

        receipts[data.requestId] = data;
        ownerOf[data.requestId] = to;
        balanceOf[to] += 1;

        emit Transfer(address(0), to, data.requestId);
        emit ReceiptMinted(data.requestId, to, data.collateralAmount);
    }

    /// @notice Burn un Repo Receipt. Appelé par RepoEscrow.repayRequest() ou claimDefaultRequest().
    function burn(uint256 tokenId) external onlyEscrow {
        address owner = ownerOf[tokenId];
        require(owner != address(0), "RepoReceiptNFT: token does not exist");

        balanceOf[owner] -= 1;
        delete ownerOf[tokenId];
        delete receipts[tokenId];

        emit Transfer(owner, address(0), tokenId);
        emit ReceiptBurned(tokenId);
    }

    /// @notice Vérifie si un token existe.
    function exists(uint256 tokenId) external view returns (bool) {
        return ownerOf[tokenId] != address(0);
    }
}
