import { describe, expect, it } from "vitest";
import {
  hydrateFestivalCatalog,
  overlappingFestivalError,
  resolveLiveFestivalTheme,
} from "./festivalTheme.js";

describe("hydrateFestivalCatalog", () => {
  it("copies Durga Puja dates from legacy columns when catalog is empty", () => {
    const catalog = hydrateFestivalCatalog({
      festival_enabled: false,
      festival_theme: "",
      festival_starts_at: "2026-10-09T22:44:00.000Z",
      festival_ends_at: "2026-10-20T22:30:00.000Z",
      festival_catalog: {},
    });
    expect(catalog.durga_puja.enabled).toBe(false);
    expect(catalog.durga_puja.starts_at).toBe("2026-10-09T22:44:00.000Z");
    expect(catalog.diwali.enabled).toBe(false);
    expect(catalog.diwali.apply_gym_manager).toBe(false);
    expect(catalog.chhath_puja.enabled).toBe(false);
    expect(catalog.new_year_2027.enabled).toBe(false);
  });
});

describe("resolveLiveFestivalTheme", () => {
  const now = Date.parse("2026-11-02T06:00:00.000Z");

  it("stays off when disabled even inside the window", () => {
    const catalog = hydrateFestivalCatalog({
      festival_catalog: {
        diwali: {
          enabled: false,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-10T00:00:00.000Z",
          apply_website: true,
          apply_gym_manager: true,
        },
      },
    });
    expect(resolveLiveFestivalTheme(catalog, "website", now)).toBeNull();
    expect(resolveLiveFestivalTheme(catalog, "gym_manager", now)).toBeNull();
  });

  it("applies New Year 2027 to the gym app only when that flag is on", () => {
    const catalog = hydrateFestivalCatalog({
      festival_catalog: {
        new_year_2027: {
          enabled: true,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-10T00:00:00.000Z",
          apply_website: false,
          apply_gym_manager: true,
        },
      },
    });
    expect(resolveLiveFestivalTheme(catalog, "website", now)).toBeNull();
    expect(resolveLiveFestivalTheme(catalog, "gym_manager", now)).toBe("new_year_2027");
  });

  it("applies Diwali to the gym app only when that flag is on", () => {
    const catalog = hydrateFestivalCatalog({
      festival_catalog: {
        diwali: {
          enabled: true,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-10T00:00:00.000Z",
          apply_website: false,
          apply_gym_manager: true,
        },
      },
    });
    expect(resolveLiveFestivalTheme(catalog, "website", now)).toBeNull();
    expect(resolveLiveFestivalTheme(catalog, "gym_manager", now)).toBe("diwali");
  });

  it("returns null when two enabled windows overlap", () => {
    const catalog = hydrateFestivalCatalog({
      festival_catalog: {
        durga_puja: {
          enabled: true,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-10T00:00:00.000Z",
          apply_website: true,
          apply_gym_manager: false,
        },
        diwali: {
          enabled: true,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-10T00:00:00.000Z",
          apply_website: true,
          apply_gym_manager: false,
        },
      },
    });
    expect(resolveLiveFestivalTheme(catalog, "website", now)).toBeNull();
  });
});

describe("overlappingFestivalError", () => {
  it("rejects overlapping enabled schedules", () => {
    const catalog = hydrateFestivalCatalog({
      festival_catalog: {
        durga_puja: {
          enabled: true,
          starts_at: "2026-10-01T00:00:00.000Z",
          ends_at: "2026-10-20T00:00:00.000Z",
          apply_website: true,
        },
      },
    });
    const err = overlappingFestivalError(catalog, "diwali", {
      enabled: true,
      starts_at: "2026-10-15T00:00:00.000Z",
      ends_at: "2026-10-25T00:00:00.000Z",
      apply_website: true,
      apply_gym_manager: false,
    });
    expect(err).toMatch(/overlaps/i);
  });
});
