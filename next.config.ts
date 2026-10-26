import type { NextConfig } from "next";
const pagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = pagesBuild ? "/oddk-todo" : "";

const nextConfig: NextConfig = {
  output: pagesBuild ? "export" : undefined,
  basePath,
  trailingSlash: pagesBuild,
  images: { unoptimized: pagesBuild },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: !pagesBuild,
  partialPrefetching: !pagesBuild,
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
