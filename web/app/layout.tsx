import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
// Rounded and friendly: the bubble letters in "letters" diagrams.
const bubble = Fredoka({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-bubble" });

export const metadata: Metadata = {
  title: "Live lesson",
  description: "Live transcript and diagrams for teachers",
  icons: { icon: "/crane.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={bubble.variable}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
