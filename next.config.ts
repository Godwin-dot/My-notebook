import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const cacheRevision = `${process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  additionalPrecacheEntries: [
    { url: "/", revision: cacheRevision },
    { url: "/settings", revision: cacheRevision },
    { url: "/offline", revision: cacheRevision },
    { url: "/manifest.json", revision: cacheRevision },
    { url: "/icons/notebook-192.svg", revision: cacheRevision },
    { url: "/icons/notebook-512.svg", revision: cacheRevision },
  ],
});

export default withSerwist(nextConfig);
