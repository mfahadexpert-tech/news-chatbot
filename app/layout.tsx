import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorldBrief AI News",
  description: "Worldwide news, trusted video coverage and a helpful AI news assistant.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
