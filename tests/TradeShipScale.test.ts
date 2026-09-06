import { describe, expect, it } from "vitest";
import { Config } from "../src/core/configuration/Config";
import { GameConfig } from "../src/core/Schemas";

function config(gameMap: string): Config {
  return new Config({ gameMap } as GameConfig, null, false);
}

describe("expanded-world trade density", () => {
  it("preserves the upstream curve at proportional map-area population", () => {
    const normal = config("World");
    const xl = config("Expanded Earth XL");
    const ultra = config("Expanded Earth Ultra");
    // Rejections are a global consecutive-failure counter, not a population
    // quantity, so only the live ship population scales with map area.
    expect(xl.tradeShipSpawnRate(12, 400 * 4)).toBe(
      normal.tradeShipSpawnRate(12, 400),
    );
    expect(ultra.tradeShipSpawnRate(12, 400 * 16)).toBe(
      normal.tradeShipSpawnRate(12, 400),
    );
  });

  it("allows significantly denser seas before saturation on Ultra", () => {
    const normal = config("World");
    const ultra = config("Expanded Earth Ultra");
    expect(ultra.tradeShipSpawnRate(0, 400)).toBeLessThan(
      normal.tradeShipSpawnRate(0, 400),
    );
  });
});
