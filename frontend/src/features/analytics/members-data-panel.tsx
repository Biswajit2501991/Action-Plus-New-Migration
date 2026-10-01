"use client";

import { useMemo, useState } from "react";
import { AccentMetricCard } from "@/components/ui/accent-metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { useGymCodes } from "@/hooks/use-data";
import {
  TSHIRT_SIZES,
  normalizeTshirtSize,
  tshirtSizeChoiceLabel,
} from "@/lib/domain/tshirt-size";
import { downloadTextFile, toCsv } from "@/lib/utils";
import type { Member } from "@/types";

const STATUSES = ["Active", "Hold", "Deactivated", "Cancelled"] as const;

function branchLabel(
  id: string,
  codes: Array<{ id: string; name?: string; branchName?: string; code?: string }>,
) {
  const row = codes.find((code) => code.id === id);
  return row?.branchName || row?.name || row?.code || id || "—";
}

export function MembersDataPanel({
  members,
  loading,
}: {
  members: Member[];
  loading: boolean;
}) {
  const { data: gymCodes = [] } = useGymCodes();
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [branch, setBranch] = useState("all");
  const [size, setSize] = useState("all");

  const plans = useMemo(() => {
    const names = new Set<string>();
    for (const member of members) {
      const label = String(member.plan || "").trim();
      if (label) names.add(label);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const branches = useMemo(() => {
    const ids = new Set<string>();
    for (const member of members) {
      const id = String(member.assignedGymCodeId || member.assigned_gym_code_id || "").trim();
      if (id) ids.add(id);
    }
    return [...ids];
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter((member) => {
      if (status !== "all" && String(member.status || "") !== status) return false;
      if (plan !== "all" && String(member.plan || "") !== plan) return false;
      const memberBranch = String(member.assignedGymCodeId || member.assigned_gym_code_id || "");
      if (branch !== "all" && memberBranch !== branch) return false;
      const chosen = normalizeTshirtSize(member.tshirtSize);
      if (size === "missing") return !chosen;
      if (size !== "all" && chosen !== size) return false;
      return true;
    });
  }, [members, status, plan, branch, size]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = { missing: 0 };
    for (const option of TSHIRT_SIZES) tally[option.id] = 0;
    for (const member of filtered) {
      const chosen = normalizeTshirtSize(member.tshirtSize);
      if (!chosen) tally.missing += 1;
      else tally[chosen] += 1;
    }
    return tally;
  }, [filtered]);

  function exportCsv() {
    downloadTextFile(
      "members-data.csv",
      toCsv(
        filtered.map((member) => {
          const chosen = normalizeTshirtSize(member.tshirtSize);
          const memberBranch = String(member.assignedGymCodeId || member.assigned_gym_code_id || "");
          return {
            name: member.name || "",
            memberId: member.memberId,
            status: member.status || "",
            plan: member.plan || "",
            branch: branchLabel(memberBranch, gymCodes),
            tshirtSize: chosen || "",
            chest: TSHIRT_SIZES.find((row) => row.id === chosen)?.chest || "",
            savesUsed: Number(member.tshirtSizeUpdates) || 0,
          };
        }),
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Read-only. Combines status, plan, branch, and T-shirt size. Soft-deleted members stay out
          of this list.
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">All plans</option>
          {plans.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="all">All branches</option>
          {branches.map((id) => (
            <option key={id} value={id}>
              {branchLabel(id, gymCodes)}
            </option>
          ))}
        </Select>
        <Select value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="all">All sizes</option>
          <option value="missing">Not set</option>
          {TSHIRT_SIZES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} {item.chest}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {TSHIRT_SIZES.map((item) => (
          <AccentMetricCard
            key={item.id}
            tone="sky"
            label={`${item.label}  ${item.chest}`}
            value={String(counts[item.id] || 0)}
          />
        ))}
        <AccentMetricCard tone="slate" label="Not set" value={String(counts.missing || 0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Members
            <span className="ml-2 text-sm font-normal text-muted-foreground">{filtered.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-muted-foreground">Loading members…</p> : null}
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Plan</th>
                <th className="px-2 py-2 font-medium">Branch</th>
                <th className="px-2 py-2 font-medium">T-shirt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((member) => {
                const memberBranch = String(
                  member.assignedGymCodeId || member.assigned_gym_code_id || "",
                );
                return (
                  <tr key={member.memberId} className="border-b border-border/60">
                    <td className="px-2 py-2 font-medium">{member.name || "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{member.memberId}</td>
                    <td className="px-2 py-2">{member.status || "—"}</td>
                    <td className="px-2 py-2">{member.plan || "—"}</td>
                    <td className="px-2 py-2">{branchLabel(memberBranch, gymCodes)}</td>
                    <td className="px-2 py-2">{tshirtSizeChoiceLabel(member.tshirtSize)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !filtered.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No members match these filters.</p>
          ) : null}
          {filtered.length > 400 ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing the first 400. Export CSV for the full filtered list.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
