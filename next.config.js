/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-auth"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "piro.vargasjr.dev"],
    },
  },
};

module.exports = nextConfig;
