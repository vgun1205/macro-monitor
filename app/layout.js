import "./globals.css";

export const metadata = {
  title: "RM Native",
  description: "Rates · FX · Credit · Equity daily monitor",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "RM Native" },
  icons: { icon: "/favicon-32.png", apple: "/apple-touch-icon.png" },
};

export const viewport = {
  themeColor: "#0E1726",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
