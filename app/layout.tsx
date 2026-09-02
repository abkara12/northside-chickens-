import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Northside Chickens",
    template: "%s | Northside Chickens",
  },
  description: "Northside Chickens",
  applicationName: "Northside Chickens",
  manifest: "/manifest.webmanifest",

  icons: {
    // ✅ Browser tab + general favicon requests (browsers often request /favicon.ico)
    icon: [
      { url: "/icons/favicon.ico" , type: "image/x-icon" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],

    // ✅ iPhone/iPad Home Screen icon (Safari)
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],

    // ✅ optional
    shortcut: [{ url: "/favicon.ico" }],
  },

  themeColor: "#0b0b0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
