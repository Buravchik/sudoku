import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import GoogleAnalytics from "@/components/GoogleAnalytics";

export const metadata: Metadata = {
  title: "Sudoku",
  description: "Sudoku game for Telegram",
};

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
  viewportFit: "cover",
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var dark=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.add(dark?'dark':'light');}catch(e){}})();",
          }}
        />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <GoogleAnalytics />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
