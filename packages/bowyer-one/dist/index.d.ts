export interface BowyerOneConfig {
    baseUrl: string;
    name: string;
    tagline: string;
    category: string;
    description: string;
    ownerAddress?: string;
    llm?: {
        mode: "platform";
        model: "fast" | "balanced" | "deep";
    };
}
export declare function launchBusiness(config: BowyerOneConfig): Promise<{
    slug: string;
    url: string;
    mcpEndpoint: string;
}>;
