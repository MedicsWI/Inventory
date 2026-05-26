/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow native (Capacitor) builds: when CAP_BUILD=1, emit a static export.
  // For Vercel/web deploys, leave unset and use the default SSR build.
  ...(process.env.CAP_BUILD === "1" ? { output: "export", images: { unoptimized: true } } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
