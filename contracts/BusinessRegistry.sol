// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BOWYER Business Registry — on-chain pages for agent businesses on Robinhood Chain.
 *
 * Maps a slug to the live MCP endpoint, payout address, pricing model, creator,
 * listing flag, and metadata URI. The marketplace UI remains the UX; this contract
 * is the portable source of truth other indexers / ACP wrappers can read.
 *
 * Deploy with Foundry or Remix. Set BUSINESS_REGISTRY_ADDRESS in the app env after deploy.
 * The off-chain SQLite mirror in BOWYER stays in sync via /api/registry.
 */
contract BusinessRegistry {
    struct Business {
        string slug;
        string mcpUrl;
        address payout;
        address creator;
        string priceModel; // "free" | "subscription" | "one-time" | "x402"
        uint256 priceUsdCents;
        bool listed;
        string metadataURI;
        uint64 updatedAt;
    }

    address public owner;
    mapping(bytes32 => Business) private bySlug;
    bytes32[] public slugKeys;

    event BusinessUpserted(
        bytes32 indexed slugHash,
        string slug,
        address indexed creator,
        address payout,
        bool listed
    );
    event BusinessUnlisted(bytes32 indexed slugHash, string slug);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "zero");
        owner = next;
    }

    function slugHash(string calldata slug) public pure returns (bytes32) {
        return keccak256(bytes(slug));
    }

    function upsert(
        string calldata slug,
        string calldata mcpUrl,
        address payout,
        address creator,
        string calldata priceModel,
        uint256 priceUsdCents,
        bool listed,
        string calldata metadataURI
    ) external onlyOwner {
        require(bytes(slug).length > 0 && bytes(slug).length <= 64, "slug");
        bytes32 key = slugHash(slug);
        if (bytes(bySlug[key].slug).length == 0) {
            slugKeys.push(key);
        }
        bySlug[key] = Business({
            slug: slug,
            mcpUrl: mcpUrl,
            payout: payout,
            creator: creator,
            priceModel: priceModel,
            priceUsdCents: priceUsdCents,
            listed: listed,
            metadataURI: metadataURI,
            updatedAt: uint64(block.timestamp)
        });
        emit BusinessUpserted(key, slug, creator, payout, listed);
    }

    function setListed(string calldata slug, bool listed) external onlyOwner {
        bytes32 key = slugHash(slug);
        require(bytes(bySlug[key].slug).length > 0, "missing");
        bySlug[key].listed = listed;
        bySlug[key].updatedAt = uint64(block.timestamp);
        if (!listed) emit BusinessUnlisted(key, slug);
        else emit BusinessUpserted(key, slug, bySlug[key].creator, bySlug[key].payout, true);
    }

    function get(string calldata slug) external view returns (Business memory) {
        return bySlug[slugHash(slug)];
    }

    function count() external view returns (uint256) {
        return slugKeys.length;
    }

    function keyAt(uint256 i) external view returns (bytes32) {
        return slugKeys[i];
    }

    function getByKey(bytes32 key) external view returns (Business memory) {
        return bySlug[key];
    }
}
