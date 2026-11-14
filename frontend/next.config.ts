import type { NextConfig } from "next";
import path from "path";

function resolveApiProxyTarget() {
  let raw = String(process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").trim();
  if (!raw) raw = "http://127.0.0.1:4000";
  // Railway users often paste the host without a scheme; Next rewrites require one.
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw.replace(/\/+$/, "");
}

const backendTarget = resolveApiProxyTarget();

const nextConfig: NextConfig = {
  // Railway runs lint and typecheck together and the lint worker exits 1
  // before it prints anything. Types are still checked during `next build`.
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
  async rewrites() {
    // Use fallback so App Router handlers (portal-ui-settings, referrals,
    // next-form-number, etc.) win; everything else proxies to Express.
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendTarget}/api/:path*`,
        },
      ],
    };
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
