import type { NextConfig } from "next";
import path from "path";

const API_BACKEND = process.env.API_BACKEND || "http://localhost:4002";

const nextConfig: NextConfig = {
  output: "export", // static export (no Node runtime needed)
  images: { unoptimized: true },
  turbopack: {
    root: path.join(__dirname),
  },
  // Rewrites do NOT run in a static export - the browser hits NEXT_PUBLIC_API_URL directly (CORS enabled on the backend).
};

export default nextConfig;
