export async function launchBusiness(config) {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: config.name,
            tagline: config.tagline,
            category: config.category,
            description: config.description,
            revenueModel: "Free",
            priceUsd: 0,
            ownerAddress: config.ownerAddress,
            llm: config.llm ?? { mode: "platform", model: "balanced" },
        }),
    });
    const json = (await res.json());
    if (!res.ok || !json.slug) {
        throw new Error(json.error ?? `Launch failed (HTTP ${res.status})`);
    }
    const slug = json.slug;
    const base = config.baseUrl.replace(/\/$/, "");
    return {
        slug,
        url: `${base}/agents/${slug}`,
        mcpEndpoint: `${base}/api/mcp/${slug}`,
    };
}
