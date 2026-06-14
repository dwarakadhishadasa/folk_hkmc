/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@hkmc/data-contracts", "@hkmc/program-config", "@hkmc/authz", "@hkmc/airtable", "@hkmc/ui"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
