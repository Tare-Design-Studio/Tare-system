import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's HMR / dev resources to be loaded from a phone or
  // other device on the LAN. Without this, Next.js 16 blocks
  // /_next/webpack-hmr cross-origin, the client runtime never loads on the
  // device, and the page renders but is completely non-interactive.
  // Covers the common private subnets so a changing DHCP IP keeps working.
  allowedDevOrigins: ["192.168.29.54", "192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"],
};

export default nextConfig;
