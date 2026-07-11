export interface BowyerOneConfig {
  baseUrl: string;
  name: string;
  tagline: string;
  category: string;
  description: string;
  ownerAddress?: string;
  llm?: { mode: "platform"; model: "fast" | "balanced" | "deep" };
}

export async function launchBusiness(config: BowyerOneConfig): Promise<{
  slug: string;
  url: string;
  mcpEndpoint: string;
}> {
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
  const json = (await res.json()) as { ok?: boolean; slug?: string; error?: string };
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
