import type { NextConfig } from "next";
import path from "path";

// Minimal shape of the webpack config we touch — the real webpack types
// aren't a direct dependency of this repo.
type WebpackExternal =
  | string
  | ((
      ctx: { request?: string },
      callback: (err?: Error | null, result?: string) => void
    ) => void);
interface WebpackishConfig {
  externals?: WebpackExternal | WebpackExternal[];
  resolve?: { alias?: Record<string, string | false> };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "unpdf", "@nktkas/hyperliquid", "cycletls"],
  async redirects() {
    return [{ source: "/build", destination: "/docs", permanent: true }];
  },
  webpack: (
    config: WebpackishConfig,
    { isServer, nextRuntime }: { isServer: boolean; nextRuntime?: string }
  ) => {
    if (!isServer) return config;

    // The edge compilation of instrumentation.ts traces dynamic imports into
    // cycletls, which needs Node built-ins. Edge never actually runs that code
    // (register() early-returns), so stub the module out of edge bundles.
    if (nextRuntime === "edge") {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...(config.resolve.alias ?? {}), cycletls: false };
    }

    // Treat `node:foo` as external commonjs `foo` so webpack never tries to
    // open a `node:` URI (UnhandledSchemeError in next dev instrumentation).
    const prev = config.externals;
    config.externals = [
      ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
      ({ request }, callback) => {
        if (request?.startsWith("node:")) {
          callback(null, `commonjs ${request.slice("node:".length)}`);
          return;
        }
        callback();
      },
    ];
    return config;
  },
};

export default nextConfig;
