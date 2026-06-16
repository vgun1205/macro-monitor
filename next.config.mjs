/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDF 생성용 헤드리스 크로미움은 번들링 제외(서버 외부 패키지로 처리)
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // chromium 바이너리(bin/*.br)를 cron 함수 번들에 강제 포함
  outputFileTracingIncludes: {
    "/api/cron/collect": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};
export default nextConfig;
