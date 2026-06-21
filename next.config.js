/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-auth"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "piro.vargasjr.dev"],
    },
  },
  // Include Python source files in the serverless bundle so the seed endpoint
  // can read them via readFileSync at /var/task/model/*.py
  outputFileTracingIncludes: {
    "/api/admin/seed-class-modules": ["./model/*.py"],
  },
};

module.exports = nextConfig;
