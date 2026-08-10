import type { Metadata } from "next";
import { PaperTelegramPage } from "./paper-telegram-page";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// A shared ?theme=owl-post link gets the Great Hall social card, so the
// preview matches what the page will look like when it opens.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const theme = params.theme;
  const owl = theme === "owl-post" || theme === "owl" || theme === "hogwarts";
  if (!owl) return {};
  return {
    openGraph: {
      title: "Send Vinny & Chase a Paper Telegram",
      description: "A real printer. A real piece of paper. A message just for them.",
      type: "website",
      url: "/?theme=owl-post",
      images: [
        {
          url: "/og-owl.png",
          width: 1200,
          height: 630,
          alt: "A candlelit great hall behind a parchment letter addressed to Vinny and Chase",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Send Vinny & Chase a Paper Telegram",
      description: "A real printer. A real piece of paper. A message just for them.",
      images: ["/og-owl.png"],
    },
  };
}

export default function Home() {
  return <PaperTelegramPage />;
}
