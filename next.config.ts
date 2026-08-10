import type { NextConfig } from "next";
import { resolve } from "path";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["192.168.31.26"],
  // Native C++ addons must be loaded via Node's require, not Next's bundler
  // loader (avoids "Module did not self-register" / ERR_DLOPEN_FAILED).
  serverExternalPackages: ["better-sqlite3", "node-pty"],
  turbopack: {
    root: resolve(import.meta.dirname),
  },
};

export default withSerwist(nextConfig);
