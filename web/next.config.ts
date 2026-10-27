import type { NextConfig } from "next";

// Django (B6 accounts API and the Google redirect flow). Proxied so the browser sees one origin:
// the session and csrftoken cookies then work without CORS.
const DJANGO_URL = process.env.DJANGO_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The floating dev badge sits on top of the action bar.
  devIndicators: false,
  // Django URLs end with "/"; keep it instead of redirecting to the slash-less form.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // ":path*" drops the trailing slash, so the slash is written out in both rules.
    return ["api", "accounts"].map((prefix) => ({
      source: `/${prefix}/:path*/`,
      destination: `${DJANGO_URL}/${prefix}/:path*/`,
    }));
  },
};

export default nextConfig;
