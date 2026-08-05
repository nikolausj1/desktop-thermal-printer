import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLocationLabel,
  inferDeviceLabel,
  lookupApproximateLocation,
} from "../../../supabase/functions/_shared/origin-metadata.js";

test("infers broad device labels without claiming laptop versus desktop", () => {
  assert.equal(
    inferDeviceLabel(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    ),
    "iPhone",
  );
  assert.equal(
    inferDeviceLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36",
    ),
    "Windows computer",
  );
  assert.equal(inferDeviceLabel("unknown", '"Android"', "?1"), "Android device");
  assert.equal(inferDeviceLabel("unknown"), "device");
});

test("formats US and international approximate locations", () => {
  assert.equal(
    formatLocationLabel({
      city: "Portland",
      region: "OR",
      country: "United States",
      countryCode: "US",
    }),
    "Portland, OR",
  );
  assert.equal(
    formatLocationLabel({
      city: "London",
      region: "England",
      country: "United Kingdom",
      countryCode: "GB",
    }),
    "London, United Kingdom",
  );
});

test("location lookup returns a coarse label and fails open", async () => {
  const successfulFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        city: "Portland",
        region: "Oregon",
        region_code: "OR",
        country: "United States",
        country_code: "US",
      }),
      { status: 200 },
    );

  assert.deepEqual(await lookupApproximateLocation("203.0.113.10", successfulFetch), {
    city: "Portland",
    region: "OR",
    country: "United States",
    countryCode: "US",
    label: "Portland, OR",
  });

  const failingFetch: typeof fetch = async () => {
    throw new Error("provider unavailable");
  };
  assert.equal(await lookupApproximateLocation("203.0.113.10", failingFetch), null);
  assert.equal(await lookupApproximateLocation("unknown", failingFetch), null);
});
