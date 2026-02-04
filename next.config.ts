import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Enable standalone output for Electron packaging
  output: "standalone",
  // Set the output file tracing root to this project directory
  // This prevents Next.js from inferring the wrong workspace root
  // and creating nested folder structures in standalone output
  outputFileTracingRoot: path.join(__dirname),
  // Exclude large/irrelevant directories from standalone output tracing.
  // Without this, Next.js copies dist-electron, .local-data (vectordb files), .git etc. into .next/standalone/
  outputFileTracingExcludes: [
    "dist-electron/**",
    ".git/**",
    ".local-data/**",
    "node_modules/.cache/**",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Exclude Remotion and esbuild packages from Turbopack bundling
  // These packages contain native binaries and platform-specific code
  // that should not be processed by the bundler
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-win32-x64-msvc",
    "esbuild",
    "@esbuild/darwin-arm64",
    "@esbuild/darwin-x64",
    "@esbuild/linux-arm64",
    "@esbuild/linux-x64",
    "@esbuild/win32-x64",
    "@esbuild/android-arm",
    "@esbuild/android-arm64",
    "@esbuild/android-x64",
    "@esbuild/freebsd-arm64",
    "@esbuild/freebsd-x64",
    "@esbuild/linux-arm",
    "@esbuild/linux-ia32",
    "@esbuild/linux-loong64",
    "@esbuild/linux-mips64el",
    "@esbuild/linux-ppc64",
    "@esbuild/linux-riscv64",
    "@esbuild/linux-s390x",
    "@esbuild/netbsd-x64",
    "@esbuild/openbsd-x64",
    "@esbuild/sunos-x64",
    "@esbuild/win32-arm64",
    "@esbuild/win32-ia32",
    "webpack",
    "terser-webpack-plugin",
    // LanceDB - embedded vector database with native bindings
    "@lancedb/lancedb",
    "@lancedb/lancedb-darwin-arm64",
    "@lancedb/lancedb-darwin-x64",
    "@lancedb/lancedb-linux-arm64-gnu",
    "@lancedb/lancedb-linux-arm64-musl",
    "@lancedb/lancedb-linux-x64-gnu",
    "@lancedb/lancedb-linux-x64-musl",
    "@lancedb/lancedb-win32-x64-msvc",
    "better-sqlite3",
    // PDF parsing - requires pdfjs-dist worker files and native canvas bindings
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    // Local web scraping (headless Chromium)
    "puppeteer",
    // ripgrep binary for fast pattern search
    "@vscode/ripgrep",
    // Channel connectors (Baileys/Slack/Telegram) - keep server-only
    "@whiskeysockets/baileys",
    "@hapi/boom",
    "pino",
    "jimp",
    "sharp",
    "grammy",
    "@slack/bolt",
    "qrcode",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net",
      },
    ],
  },
  // Configure webpack to handle ONNX files and exclude Remotion from bundling
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    // Exclude Remotion bundler/renderer from webpack bundling
    // These packages are dynamically imported at runtime and contain
    // Node.js-only dependencies (esbuild, webpack) that conflict with Next.js
    // Use a function-based pattern matcher to exclude entire package namespaces
    if (isServer) {
      const existingExternals = Array.isArray(config.externals) ? config.externals : [];

      // Patterns to externalize - matches entire package namespaces
      // These patterns catch both direct imports and nested dependencies
      const externalPatterns = [
        /^@remotion(\/|$)/,  // All @remotion/* packages (including @remotion itself)
        /^@esbuild(\/|$)/,   // All platform-specific esbuild packages
        /^esbuild(\/|$)/,    // Main esbuild package and subpaths
        /^webpack(\/|$)/,    // Webpack itself and subpaths
        /^terser-webpack-plugin(\/|$)/, // Webpack plugin dependency
        /^@lancedb(\/|$)/,   // LanceDB embedded vector database with native bindings
      ];

      // Function-based external that matches patterns
      // Uses webpack 5 async function signature for better compatibility
      const remotionExternalsFn = async ({
        request,
        context,
        getResolve,
      }: {
        request?: string;
        context?: string;
        getResolve?: () => (context: string, request: string) => Promise<string>;
      }): Promise<string | undefined> => {
        if (!request) {
          return undefined;
        }

        // Check if the request matches any of our patterns at the start (for module specifiers)
        for (const pattern of externalPatterns) {
          if (pattern.test(request)) {
            // Return as commonjs external to prevent bundling
            return `commonjs ${request}`;
          }
        }

        // For resolved file system paths that contain these packages anywhere in the path
        // This catches paths like:
        // - 'node_modules/@remotion/bundler/node_modules/@esbuild/darwin-arm64/README.md'
        // - './styly-agent/node_modules/@esbuild/darwin-arm64/bin/esbuild'
        const pathPatterns = [
          /node_modules\/@remotion\//,
          /node_modules\/@esbuild\//,
          /node_modules\/esbuild\//,
          /node_modules\/webpack\//,
          /node_modules\/terser-webpack-plugin\//,
          /node_modules\/@lancedb\//,
        ];

        for (const pattern of pathPatterns) {
          if (pattern.test(request)) {
            return `commonjs ${request}`;
          }
        }

        // Let webpack handle it normally
        return undefined;
      };

      config.externals = [...existingExternals, remotionExternalsFn];
    }

    return config;
  },
  // Add headers for WebGPU and SharedArrayBuffer support
  async headers() {
    return [
      {
        // Use credentialless COEP to allow cross-origin images while still enabling SharedArrayBuffer
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // credentialless allows cross-origin resources without CORS (like CloudFront images)
          // while still enabling SharedArrayBuffer for ONNX Runtime Web
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
