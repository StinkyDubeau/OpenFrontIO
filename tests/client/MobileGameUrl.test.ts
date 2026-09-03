import { describe, expect, it } from "vitest";
import { normalizeGameUrl } from "../../apps/mobile/src/config/normalizeGameUrl";

describe("native game URL normalization", () => {
  it("keeps the configured query on the experimental route", () => {
    expect(
      normalizeGameUrl(
        "https://atlas-dev.sightings.today/experimental/massive-world?duration=1d",
      ),
    ).toBe(
      "https://atlas-dev.sightings.today/experimental/massive-world/?duration=1d",
    );
  });

  it("adds only a pathname slash when a fragment is present", () => {
    expect(normalizeGameUrl("https://idlefront.io/world/alpha#invite")).toBe(
      "https://idlefront.io/world/alpha/#invite",
    );
  });

  it("retains the LAN preview as the development fallback", () => {
    expect(normalizeGameUrl(undefined)).toBe("http://192.168.2.118:9000/");
  });
});
