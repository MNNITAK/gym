/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native / Node-only libs — keep them out of the bundler so they resolve from
  // node_modules at runtime inside the serverless function.
  serverExternalPackages: ["firebase-admin", "pdfkit"],
};

export default nextConfig;
