/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => `build-${Date.now()}`,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
