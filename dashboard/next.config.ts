import type { NextConfig } from "next";
import path from "path";

const isPlaywright = Boolean(process.env.PLAYWRIGHT);
const isDev = process.env.NODE_ENV !== "production";
const devDistDir = process.env.NEXT_DEV_DIST_DIR || ".next-dev-runtime";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  distDir: isPlaywright ? ".next-playwright" : isDev ? devDistDir : ".next",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    localPatterns: [{ pathname: "/**" }],
  },
};

export default nextConfig;
