/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Сборка падает при ошибках типов — так их не пропустить
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

