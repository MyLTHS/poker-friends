import { describe, expect, it } from "vitest";

import { chipColumns } from "./chips";

describe("chipColumns, one column", () => {
  it("mixes denominations from the largest down", () => {
    // 630 = 500 + 100 + 25 + 5
    expect(chipColumns(630)).toEqual([[500, 100, 25, 5]]);
  });

  it("draws at most `max` chips, keeping the largest", () => {
    expect(chipColumns(3000)).toEqual([[500, 500, 500, 500, 500]]);
    // 1260 = 2×500 + 2×100 + 2×25 + 2×5: eight chips, five shown
    expect(chipColumns(1260)).toEqual([[500, 500, 100, 100, 25]]);
    expect(chipColumns(1260, 1, 3)).toEqual([[500, 500, 100]]);
  });

  it("draws one chip for nothing at all, so a zero bet still shows a chip", () => {
    expect(chipColumns(0)).toEqual([[1]]);
    expect(chipColumns(-50)).toEqual([[1]]);
    expect(chipColumns(1)).toEqual([[1]]);
  });

  it("ignores fractions", () => {
    expect(chipColumns(5.9)).toEqual([[5]]);
  });
});

describe("chipColumns, several columns", () => {
  it("puts one denomination per column, largest first", () => {
    expect(chipColumns(1260, 2)).toEqual([
      [500, 500],
      [100, 100],
    ]);
    expect(chipColumns(630, 3)).toEqual([[500], [100], [25]]);
  });

  it("caps every column at `max`", () => {
    expect(chipColumns(3700, 2, 4)).toEqual([[500, 500, 500, 500], [100, 100]]);
  });

  it("returns as many columns as there are denominations, never padding", () => {
    expect(chipColumns(500, 3)).toEqual([[500]]);
    expect(chipColumns(0, 3)).toEqual([[1]]);
  });
});
