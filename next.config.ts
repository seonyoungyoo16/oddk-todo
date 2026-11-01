import type { NextConfig } from "next";
const pagesBuild = process.env.GITHUB_PAGES === "true";
const appBuild = process.env.CAPACITOR_BUILD === "true";
const staticBuild = pagesBuild || appBuild;
const basePath = pagesBuild && !appBuild ? "/oddk-todo" : "";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: staticBuild ? "export" : undefined,
  distDir: appBuild ? "out-native" : ".next",
  basePath,
  trailingSlash: staticBuild,
  images: { unoptimized: staticBuild },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: !staticBuild,
  partialPrefetching: !staticBuild,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
