import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveFamilyKey } from "../../lib/family-keys";
import { PaperTelegramPage } from "../paper-telegram-page";
import { themeMetadata, type SearchParams } from "../theme-metadata";

// The private family link: papertelegram.com/<secret>.
//
// The secrets live only in the FAMILY_KEYS environment variable (the repo is
// public), one per household, so the dashboard can say which household a
// telegram came through. Anything that is not a current key 404s like any
// other missing page. The route stays out of search engines three ways: the
// robots metadata below, the X-Robots-Tag header set in next.config.ts for
// single-segment paths, and its deliberate absence from robots.txt, where a
// Disallow line would publish the very path it protects.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

const noIndex: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!resolveFamilyKey(slug)) return { robots: noIndex };
  return { robots: noIndex, ...(await themeMetadata(searchParams)) };
}

export default async function FamilyLinkPage({ params }: { params: Params }) {
  const { slug } = await params;
  const link = resolveFamilyKey(slug);
  if (!link) notFound();
  return <PaperTelegramPage channel="family" familyKey={link.key} household={link.label} />;
}
