import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow LAN devices (phone, other machines) to load dev assets over the
  // local network IP. Dev-only; has no effect in production.
  allowedDevOrigins: ["192.168.31.112"],
};

export default nextConfig;
