// PWA 매니페스트 (Next App Router가 /manifest.webmanifest 로 자동 제공)
export default function manifest() {
  return {
    name: "RM Native",
    short_name: "RM Native",
    description: "국내·해외 금리·환율·신용스프레드·주가 일별 모니터",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0E1726",
    theme_color: "#0E1726",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
