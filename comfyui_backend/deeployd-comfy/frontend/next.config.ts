import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // We run a dedicated type check via `npm run type-check`.
    // Ignore Next's TS build errors to avoid issues with .next/types imports.
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: path.join(__dirname),
  // Disable PWA/service worker for now
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
