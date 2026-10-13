import type { NextConfig } from 'next';
const nextConfig: NextConfig = { reactStrictMode: true, poweredByHeader: false, async headers() { return [{source:'/studio',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Frame-Options',value:'DENY'}]},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}] } };
export default nextConfig;
