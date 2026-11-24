import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@assay/core"],
  reactStrictMode: true,
  devIndicators: false,
};

export default config;
