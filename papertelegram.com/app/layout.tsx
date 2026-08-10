import type { Metadata, Viewport } from "next";
import { Cinzel_Decorative, Fraunces, IM_Fell_English, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const cinzel = Cinzel_Decorative({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const imFell = IM_Fell_English({
  variable: "--font-imfell",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://papertelegram.com"),
  title: "Paper Telegram | Send Vinny & Chase a Paper Telegram",
  description:
    "Send Vinny or Chase a quick note that travels through the internet and arrives as a real piece of paper.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Send Vinny & Chase a Paper Telegram",
    description: "A real printer. A real piece of paper. A message just for them.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "A thermal printer beside the words Send Vinny & Chase a Paper Telegram",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Send Vinny & Chase a Paper Telegram",
    description: "A real printer. A real piece of paper. A message just for them.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a3a66",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${jetbrainsMono.variable} ${cinzel.variable} ${imFell.variable}`}>
        {children}
        {/* Cookie-free visitor counts, referrers, and countries. */}
        <Analytics />
      </body>
    </html>
  );
}
