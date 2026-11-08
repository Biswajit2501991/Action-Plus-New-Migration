import { describe, expect, it } from "vitest";
import {
  defaultCampaign,
  isCampaignLive,
  normalizeCampaign,
  pickSegmentIndex,
  planAllowed,
  rotationForSegment,
} from "./spinWheelRules.js";

describe("spin wheel rules", () => {
  it("rejects a minimum above the maximum", () => {
    const result = normalizeCampaign({ ...defaultCampaign(), minDiscount: 20, maxDiscount: 10 });
    expect(result.ok).toBe(false);
  });

  it("keeps each slice label equal to its discount", () => {
    const result = normalizeCampaign({
      ...defaultCampaign(),
      minDiscount: 5,
      maxDiscount: 10,
      segments: [
        { discount: 5, weight: 2, label: "jackpot" },
        { discount: 10, weight: 1, label: "10 percent" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.value.segments.map((segment) => segment.label)).toEqual(["5%", "10%"]);
  });

  it("picks the slice from the weight, not from the client", () => {
    const segments = [
      { discount: 5, weight: 1 },
      { discount: 10, weight: 9 },
    ];
    expect(pickSegmentIndex(segments, () => 0)).toBe(0);
    expect(pickSegmentIndex(segments, () => 1)).toBe(1);
    expect(pickSegmentIndex(segments, () => 9)).toBe(1);
  });

  it("hides a surface that is switched off", () => {
    const campaign = {
      ...defaultCampaign(),
      enabled: true,
      showWebsite: true,
      showMemberPortal: false,
    };
    expect(isCampaignLive(campaign, { surface: "website", audienceKind: "visitor" })).toBe(true);
    expect(isCampaignLive(campaign, { surface: "member_portal", audienceKind: "member" })).toBe(false);
    expect(isCampaignLive({ ...campaign, enabled: false }, { surface: "website", audienceKind: "visitor" })).toBe(
      false,
    );
  });

  it("limits members to the saved plans and leaves visitors open", () => {
    const campaign = { ...defaultCampaign(), eligiblePlans: ["Gold"] };
    expect(planAllowed(campaign, "Gold", "member_portal")).toBe(true);
    expect(planAllowed(campaign, "Silver", "member_portal")).toBe(false);
    expect(planAllowed(campaign, "", "website")).toBe(true);
  });

  it("stops the wheel on the server slice", () => {
    expect(rotationForSegment(0, 4, 1)).toBe(360 - 45);
    expect(rotationForSegment(1, 4, 0)).toBe(-135);
  });
});
