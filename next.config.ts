import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disable caching for dynamic pages to ensure fresh UI
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30, // minimum allowed value
    },
    turbopackUseSystemTlsCerts: true, // allows Turbopack to fetch Google Fonts during build
  },
};

export default nextConfig;
