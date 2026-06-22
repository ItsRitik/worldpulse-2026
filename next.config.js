/** @type {import('next').NextConfig} */

// Security headers applied to every route. HSTS forces HTTPS (the "encrypted
// URL"/connection); the rest are standard production hardening.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
]

const nextConfig = {
  poweredByHeader: false,   // don't advertise "X-Powered-By: Next.js"
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.api-sports.io' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
