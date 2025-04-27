// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-sans' });

export const metadata: Metadata = {
  title: "Song Chunk Saver", // Your App Title
  description: "Save and practice your favorite song sections",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Keep lang and className on html
    <html lang="en" className={inter.variable}>
      {/* Move suppressHydrationWarning directly to the body tag */}
      <body suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}
