// src/app/layout.tsx (CORRECTED)
import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Or your chosen font
import "./globals.css";

// Configure the font
const inter = Inter({ subsets: ["latin"], variable: '--font-sans' });

export const metadata: Metadata = {
  title: "Song Favorites App", // Update if needed
  description: "Save your favorite song sections",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Ensure NO whitespace, newlines, or comments between these two tags
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        {/* You can have comments INSIDE body or head, just not between html and body/head */}
      </body>
    </html>
    // NO whitespace or comments here either
  );
}
