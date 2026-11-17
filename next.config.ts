import type { NextConfig } from "next";

// Every page in PitchLab is per-user and rendered at request time, so the
// Cache Components / partial prefetching model is intentionally left off.
const nextConfig: NextConfig = {
  // Lets `next dev` serve its client assets when opened as 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
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
