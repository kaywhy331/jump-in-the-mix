import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

function serverActionOrigins(): string[] {
  return (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value.includes("://") ? value : `https://${value}`).host;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

const additionalServerActionOrigins = serverActionOrigins();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url))
  },
  experimental: {
    serverActions: {
      ...(additionalServerActionOrigins.length > 0
        ? { allowedOrigins: additionalServerActionOrigins }
        : {}),
      bodySizeLimit: "1mb"
    }
  }
};

export default nextConfig;
