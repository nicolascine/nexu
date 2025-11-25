/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['tree-sitter', 'tree-sitter-typescript'],
  },
};

export default nextConfig;
