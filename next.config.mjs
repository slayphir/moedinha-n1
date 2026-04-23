/** @type {import('next').NextConfig} */
const nextConfig = {
  // SECURITY: never expose SUPABASE_SERVICE_ROLE_KEY via next.config "env".
  // Keep it server-only in the runtime environment (process.env) for Route Handlers / Server Actions.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid .next filesystem cache issues in synced folders (e.g. OneDrive).
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
