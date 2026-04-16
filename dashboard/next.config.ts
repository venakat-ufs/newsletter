import type { NextConfig } from "next";

const isPlaywright = Boolean(process.env.PLAYWRIGHT);
const isDev = process.env.NODE_ENV !== "production";
const devDistDir = process.env.NEXT_DEV_DIST_DIR || ".next-dev-runtime";

const nextConfig: NextConfig = {
  distDir: isPlaywright ? ".next-playwright" : isDev ? devDistDir : ".next",
};

export default nextConfig;
