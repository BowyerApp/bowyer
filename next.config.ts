import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Self-contained server bundle for Docker / bare-metal deploys.
  output: "standalone",
  async redirects() {
    return [{ source: "/build", destination: "/docs", permanent: true }];
  },
};

export default nextConfig;
