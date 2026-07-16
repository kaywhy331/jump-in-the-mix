import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins(),
      bodySizeLimit: "1mb"
    }
  }
};

export default nextConfig;
