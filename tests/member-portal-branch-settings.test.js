import { describe, expect, it } from "vitest";
import {
  isBranchPortalAllowed,
  effectivePortalSections,
  normalizeBranchPortalSettingsPayload,
} from "../backend/src/lib/memberPortalBranchSettings.js";
import { DEFAULT_PORTAL_SECTIONS } from "../backend/src/lib/memberPortalUiConfig.js";

describe("member portal branch soft gates", () => {
  it("allows portal when branch row is missing", () => {
    expect(isBranchPortalAllowed(null)).toBe(true);
    expect(isBranchPortalAllowed(undefined)).toBe(true);
    expect(isBranchPortalAllowed({ portal_enabled: true })).toBe(true);
  });

  it("blocks portal only when portal_enabled is false", () => {
    expect(isBranchPortalAllowed({ portal_enabled: false })).toBe(false);
  });

  it("inherits gym-wide sections when branch portal_sections is null", () => {
    const gymWide = { ...DEFAULT_PORTAL_SECTIONS, homeChat: false };
    const effective = effectivePortalSections(gymWide, {
      portal_enabled: true,
      portal_sections: null,
    });
    expect(effective.homeChat).toBe(false);
    expect(effective.homePayments).toBe(true);
  });

  it("merges branch section overrides over gym-wide", () => {
    const gymWide = { ...DEFAULT_PORTAL_SECTIONS, homeChat: true };
    const effective = effectivePortalSections(gymWide, {
      portal_enabled: true,
      portal_sections: { homeChat: false, homePayments: false },
    });
    expect(effective.homeChat).toBe(false);
    expect(effective.homePayments).toBe(false);
    expect(effective.homeProfile).toBe(true);
  });

  it("normalizes PUT payload without forcing section override", () => {
    const normalized = normalizeBranchPortalSettingsPayload(
      { portal_enabled: false },
      null,
    );
    expect(normalized.portal_enabled).toBe(false);
    expect(normalized.portal_sections).toBe(null);
  });
});
