import type { NextConfig } from "next";

// The app is entirely client-side (it reads the chain directly), so it ships
// as static files. BASE_PATH is set when hosting under a sub-path, e.g. GitHub Pages.
const basePath = process.env.BASE_PATH || "";

const config: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ["@assay/core"],
  reactStrictMode: true,
  devIndicators: false,
};

export default config;
