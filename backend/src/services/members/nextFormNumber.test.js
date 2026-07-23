import { describe, expect, it, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("../../db/supabase/client.js", () => ({
  getSupabase: () => ({ from: fromMock }),
  gymId: () => "gym-1",
}));

function membersQuery(rows) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

function auditQuery(rows) {
  return {
    select: () => ({
      eq: () => ({
        limit: async () => ({ data: rows, error: null }),
      }),
    }),
  };
}

describe("resolveNextMemberFormNumber", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("imports supabase client from backend/src/db/supabase/client.js", async () => {
    // Regression: services/members used ../db (services/db) and crashed in production.
    const client = await import("../../db/supabase/client.js");
    expect(typeof client.getSupabase).toBe("function");
    expect(typeof client.gymId).toBe("function");
  });

  it("requires gymCodeId", async () => {
    const { resolveNextMemberFormNumber } = await import("./nextFormNumber.js");
    await expect(resolveNextMemberFormNumber({})).rejects.toMatchObject({
      message: "gym-code-id-required",
      status: 400,
    });
  });

  it("returns next form number and member code for branch", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "members") {
        return membersQuery([
          { form_no: 12, member_code: "APG-12/26-AP01", deleted_at: null },
          { form_no: null, member_code: "APG-13/26-AP01", deleted_at: null },
        ]);
      }
      if (table === "member_delete_audit") {
        return auditQuery([{ member_code: "APG-14/26-AP01" }]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { resolveNextMemberFormNumber } = await import("./nextFormNumber.js");
    const result = await resolveNextMemberFormNumber({
      gymCodeId: "5c1a8728-ee4a-4c3a-9f09-eafa9934aaa2",
      branchToken: "AP01",
      yearSuffix: "26",
    });

    expect(result).toMatchObject({
      ok: true,
      formNo: 15,
      memberId: "APG-15/26-AP01",
      gymCodeId: "5c1a8728-ee4a-4c3a-9f09-eafa9934aaa2",
      branchToken: "AP01",
      yearSuffix: "26",
    });
  });

  it("starts at 1 when branch has no members", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "members") return membersQuery([]);
      if (table === "member_delete_audit") return auditQuery([]);
      throw new Error(`unexpected table ${table}`);
    });

    const { resolveNextMemberFormNumber } = await import("./nextFormNumber.js");
    const result = await resolveNextMemberFormNumber({
      gymCodeId: "branch-1",
      branchToken: "ap01",
      yearSuffix: "26",
    });

    expect(result).toMatchObject({
      ok: true,
      formNo: 1,
      memberId: "APG-1/26-AP01",
      branchToken: "AP01",
    });
  });
});
