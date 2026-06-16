/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDF 생성용 헤드리스 크로미움은 번들링 제외(서버 외부 패키지로 처리)
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};
export default nextConfig;
