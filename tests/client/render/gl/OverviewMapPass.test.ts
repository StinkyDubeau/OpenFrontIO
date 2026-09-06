import { describe, expect, it } from "vitest";
import {
  chooseOverviewRasterSize,
  DETAIL_PAGE_SIZE,
} from "../../../../src/client/render/gl/passes/OverviewMapPass";

describe("paged renderer sizing", () => {
  it("keeps normal maps native resolution", () => {
    expect(chooseOverviewRasterSize(1024, 512)).toEqual({
      width: 1024,
      height: 512,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("bounds the overview independently of world dimensions", () => {
    const raster = chooseOverviewRasterSize(16432, 7792);
    expect(raster.width).toBeLessThanOrEqual(4096);
    expect(raster.height).toBeLessThanOrEqual(4096);
    expect(raster.width * raster.height).toBeLessThanOrEqual(8.1 * 1024 * 1024);
    expect(raster.scaleX).toBeGreaterThan(1);
    expect(raster.scaleY).toBeGreaterThan(1);
  });

  it("uses exact 256 square tiles for the detail atlas", () => {
    expect(DETAIL_PAGE_SIZE).toBe(256);
  });
});
