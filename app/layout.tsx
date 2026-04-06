import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Impression Bridal Daily Log",
  description: "Store operations, daily log, and stylist reporting for Impression Bridal."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
