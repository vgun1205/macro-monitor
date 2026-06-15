import "./globals.css";

export const metadata = {
  title: "거시지표 일별 모니터",
  description: "Rates · FX · Credit · Equity daily monitor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
