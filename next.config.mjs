import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "..", ".env");
const { parsed } = config({ path: rootEnvPath });

/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
      SUPABASE_SERVICE_ROLE_KEY: parsed?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
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
