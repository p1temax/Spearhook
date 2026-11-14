import type { NextConfig } from "next";

const enableExport = process.env.NEXT_OUTPUT_EXPORT === "1";
const demoBuild = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const apiProxyTarget =
  process.env.FISHING_API_PROXY || "http://127.0.0.1:8000";

/**
 * Production: `NEXT_OUTPUT_EXPORT=1 next build` → static files for Go embed.
 * Development: Next proxies /api and /q to the Go backend so the browser stays
 * same-origin (avoids CORS / cross-origin auth redirect issues).
 */
const nextConfig: NextConfig = {
  // The dev badge sits over the sidebar brand mark; keep local review clean.
  devIndicators: false,
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
  ...(enableExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
      }
    : {
        images: { unoptimized: true },
        async rewrites() {
          // beforeFiles: run before the [[...slug]] catch-all so /api never
          // gets handled as an SPA route.
          return {
            beforeFiles: [
              {
                source: "/api/:path*",
                destination: `${apiProxyTarget}/api/:path*`,
              },
              {
                source: "/q/:path*",
                destination: `${apiProxyTarget}/q/:path*`,
              },
            ],
          };
        },
      }),
  trailingSlash: demoBuild,
  // Keep /api/.../ paths intact so Next does not 308-strip the slash
  // (308 on POST drops the body and breaks login / authenticated APIs).
  skipTrailingSlashRedirect: !demoBuild,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
