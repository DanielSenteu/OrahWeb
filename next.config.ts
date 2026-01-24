import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disable caching for dynamic pages to ensure fresh UI
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
    instrumentationHook: true, // Enable instrumentation for PostHog
  },
};

export default nextConfig;
