/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Игнорируем ошибки типов при сборке для Railway (если нужно)
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

