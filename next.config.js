/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-auth"],
  experimental: {
    serverActions: {
      // Keep in sync with TRUSTED_ORIGINS in src/lib/domains.ts (host only, no scheme)
      allowedOrigins: ["localhost:3000", "trainpiro.app", "piro.vargasjr.dev", "piro-henna.vercel.app"],
    },
  },

};

module.exports = nextConfig;
