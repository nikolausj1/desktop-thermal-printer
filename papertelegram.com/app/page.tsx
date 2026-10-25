import type { Metadata } from "next";
import { rootChannel } from "../lib/family-keys";
import { PaperTelegramPage } from "./paper-telegram-page";
import { themeMetadata, type SearchParams } from "./theme-metadata";

// Read ROOT_MODE on every request so the flip from live to demo is an
// environment change plus a redeploy, never a code change.
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return themeMetadata(searchParams);
}

export default function Home() {
  // While ROOT_MODE is "live" the root prints exactly as it always has. Once
  // it is "demo", the root becomes the public demo and only the private
  // family links (app/[slug]) reach the printer.
  return <PaperTelegramPage channel={rootChannel()} />;
}
