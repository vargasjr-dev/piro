/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-auth"],
  experimental: {
    serverActions: {
      // Keep in sync with TRUSTED_ORIGINS in src/lib/domains.ts (host only, no scheme)
      allowedOrigins: ["localhost:3000", "trainpiro.app", "piro.vargasjr.dev", "piro-henna.vercel.app"],
    },
  },
  // Include Python source files in the serverless bundle so the seed endpoint
  // can read them via readFileSync at /var/task/model/*.py
  outputFileTracingIncludes: {
    "/api/admin/seed-class-modules": ["./model/*.py"],
  },
};

module.exports = nextConfig;
