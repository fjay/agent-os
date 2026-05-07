import type { NextConfig } from "next";
import { resolve } from "path";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["192.168.31.26"],
  turbopack: {
    root: resolve(import.meta.dirname),
  },
};

export default withSerwist(nextConfig);
