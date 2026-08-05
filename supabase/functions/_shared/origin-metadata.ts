export interface ApproximateLocation {
  city: string;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  label: string;
}

type JsonRecord = Record<string, unknown>;

const LOCATION_LOOKUP_TIMEOUT_MS = 1_500;

function object(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function cleanLocationPart(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return null;
  return [...normalized].slice(0, maximumLength).join("");
}

function unquoteHeader(value: string | null): string {
  return (value || "").replace(/^"|"$/gu, "").trim();
}

export function inferDeviceLabel(
  userAgent: string,
  platformHint: string | null = null,
  mobileHint: string | null = null,
): string {
  const agent = userAgent.toLocaleLowerCase("en-US");
  const platform = unquoteHeader(platformHint).toLocaleLowerCase("en-US");
  const mobile = mobileHint === "?1";

  if (/\biphone\b/u.test(agent) || (platform === "ios" && mobile)) return "iPhone";
  if (/\bipad\b/u.test(agent) || platform === "ios") return "iPad";
  if (/\bandroid\b/u.test(agent) || platform === "android") return "Android device";
  if (/\bwindows\b/u.test(agent) || platform === "windows") return "Windows computer";
  if (/\bcros\b/u.test(agent) || platform === "chrome os") return "Chromebook";
  if (/\bmacintosh\b|\bmac os x\b/u.test(agent) || platform === "macos") return "Mac";
  if (/\blinux\b/u.test(agent) || platform === "linux") return "Linux computer";
  return mobile ? "mobile device" : "device";
}

export function formatLocationLabel(location: {
  city: string;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
}): string {
  const city = cleanLocationPart(location.city, 100);
  const region = cleanLocationPart(location.region, 100);
  const country = cleanLocationPart(location.country, 100);
  const countryCode = cleanLocationPart(location.countryCode, 2)?.toUpperCase() || null;

  if (!city) return "";
  if (countryCode === "US") return region ? `${city}, ${region}` : city;
  if (countryCode === "CA") {
    return [city, region, "Canada"].filter(Boolean).join(", ");
  }
  return country ? `${city}, ${country}` : city;
}

export async function lookupApproximateLocation(
  ipAddress: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ApproximateLocation | null> {
  if (!ipAddress || ipAddress === "unknown") return null;

  try {
    const response = await fetchImplementation(
      `https://ipwho.is/${encodeURIComponent(ipAddress)}?fields=success,city,region,region_code,country,country_code`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(LOCATION_LOOKUP_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;

    const body = object(await response.json());
    if (!body || body.success !== true) return null;

    const city = cleanLocationPart(body.city, 100);
    const region =
      cleanLocationPart(body.region_code, 100) || cleanLocationPart(body.region, 100);
    const country = cleanLocationPart(body.country, 100);
    const countryCode = cleanLocationPart(body.country_code, 2)?.toUpperCase() || null;
    if (!city) return null;

    const label = formatLocationLabel({ city, region, country, countryCode });
    if (!label) return null;

    return { city, region, country, countryCode, label };
  } catch {
    return null;
  }
}
