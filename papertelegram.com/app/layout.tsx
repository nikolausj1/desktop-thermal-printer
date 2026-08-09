import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://papertelegram.com"),
  title: "Paper Telegram | Send Chase or Vinny a Note",
  description:
    "Send Chase or Vinny a quick note that travels through the internet and arrives as a real piece of paper.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Send Chase or Vinny a Paper Telegram",
    description: "A real printer. A real piece of paper. A message just for them.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "A thermal printer beside the words Send Chase or Vinny a Paper Telegram",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Send Chase or Vinny a Paper Telegram",
    description: "A real printer. A real piece of paper. A message just for them.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#17140f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
