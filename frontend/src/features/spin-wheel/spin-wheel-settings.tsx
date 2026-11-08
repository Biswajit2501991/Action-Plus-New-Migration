"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/api/client";
import { SpinWheelAnalytics } from "@/features/spin-wheel/spin-wheel-analytics";
import { SpinWheelModal } from "@/features/spin-wheel/spin-wheel-modal";
import { defaultSegments } from "@/features/spin-wheel/defaults";

type Segment = { label: string; discount: number; weight: number };

type Campaign = {
  enabled: boolean;
  showWebsite: boolean;
  showMemberPortal: boolean;
  showGymManager: boolean;
  title: string;
  subtitle: string;
  buttonLabel: string;
  minDiscount: number;
  maxDiscount: number;
  segments: Segment[];
  startsAt: string | null;
  endsAt: string | null;
  audience: "all" | "members" | "visitors";
  eligiblePlans: string[];
  popupDelaySec: number;
  closeOverlay: boolean;
  cooldownHours: number;
  spinsPerPerson: number;
  couponExpiryDays: number;
  allowStack: boolean;
  branchOverrides: Record<string, { enabled: boolean }>;
};

const EMPTY: Campaign = {
  enabled: false,
  showWebsite: false,
  showMemberPortal: false,
  showGymManager: false,
  title: "Spin & Win",
  subtitle: "Spin for a membership discount",
  buttonLabel: "SPIN",
  minDiscount: 5,
  maxDiscount: 10,
  segments: defaultSegments(5, 10, 6),
  startsAt: null,
  endsAt: null,
  audience: "all",
  eligiblePlans: [],
  popupDelaySec: 2,
  closeOverlay: true,
  cooldownHours: 24,
  spinsPerPerson: 1,
  couponExpiryDays: 14,
  allowStack: false,
  branchOverrides: {},
};

export function SpinWheelSettings({
  open,
  onToggle,
  gymCodes,
}: {
  open: boolean;
  onToggle: () => void;
  gymCodes: { id: string; name?: string; code?: string; label?: string; branchName?: string; displayName?: string | null }[];
}) {
  const [campaign, setCampaign] = useState<Campaign>(EMPTY);
  const [plansText, setPlansText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponNote, setCouponNote] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch<{ campaign: Campaign }>("/spin-wheel/campaign")
      .then((payload) => {
        setCampaign({ ...EMPTY, ...payload.campaign, segments: payload.campaign.segments?.length ? payload.campaign.segments : EMPTY.segments });
        setPlansText((payload.campaign.eligiblePlans || []).join(", "));
      })
      .catch(() => toast.error("Could not load the spin wheel."));
  }, [open]);

  const branches = gymCodes.map((gym) => ({
    id: gym.id,
    label: gym.displayName || gym.branchName || gym.label || gym.name || gym.code || gym.id,
  }));

  function patch(partial: Partial<Campaign>) {
    setCampaign((current) => ({ ...current, ...partial }));
  }

  async function save(next: Campaign, planLine = plansText) {
    setBusy(true);
    try {
      const saved = await apiFetch<{ campaign: Campaign }>("/spin-wheel/campaign", {
        method: "PUT",
        body: JSON.stringify({
          ...next,
          eligiblePlans: planLine
            .split(",")
            .map((plan) => plan.trim())
            .filter(Boolean),
          startsAt: next.startsAt || null,
          endsAt: next.endsAt || null,
        }),
      });
      setCampaign(saved.campaign);
      toast.success("Spin wheel saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the spin wheel.");
    } finally {
      setBusy(false);
    }
  }

  async function lookupCoupon(redeem: boolean) {
    const code = couponCode.trim();
    if (!code) return;
    try {
      if (!redeem) {
        const found = await apiFetch<{ coupon: CouponView }>(`/spin-wheel/coupons/${encodeURIComponent(code)}`);
        setCouponNote(couponText(found.coupon));
        return;
      }
      const found = await apiFetch<{ coupon: CouponView }>("/spin-wheel/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCouponNote(couponText(found.coupon));
      toast.success("Coupon marked redeemed.");
    } catch (err) {
      setCouponNote(err instanceof Error ? err.message : "That code could not be checked.");
    }
  }

  return (
    <Card id="settings-spin" className="overflow-hidden border-amber-200/80 shadow-sm dark:border-amber-900/40">
      <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-violet-500" />
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white px-4 py-3.5 text-left dark:border-amber-900/40 dark:from-amber-950/30 dark:to-card"
        onClick={onToggle}
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            <Gift className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Spin Offer Wheel</span>
            <span className="block text-xs text-muted-foreground">
              Website, Member Portal, and Gym Manager. Off until you turn a surface on.
            </span>
          </span>
        </span>
        <span className="text-xs font-semibold">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="space-y-4 p-4">
          <Toggle
            label="Wheel is on"
            description="The master switch. Off hides the wheel everywhere and keeps the coupons already issued."
            checked={campaign.enabled}
            onChange={(enabled) => patch({ enabled })}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle label="Website" checked={campaign.showWebsite} onChange={(showWebsite) => patch({ showWebsite })} />
            <Toggle
              label="Member Portal"
              checked={campaign.showMemberPortal}
              onChange={(showMemberPortal) => patch({ showMemberPortal })}
            />
            <Toggle
              label="Gym Manager"
              checked={campaign.showGymManager}
              onChange={(showGymManager) => patch({ showGymManager })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Title" value={campaign.title} onChange={(title) => patch({ title })} />
            <Field label="Button" value={campaign.buttonLabel} onChange={(buttonLabel) => patch({ buttonLabel })} />
          </div>
          <Field label="Subtitle" value={campaign.subtitle} onChange={(subtitle) => patch({ subtitle })} />
          <div className="grid gap-2 sm:grid-cols-4">
            <NumberField label="Min %" value={campaign.minDiscount} onChange={(minDiscount) => patch({ minDiscount })} />
            <NumberField label="Max %" value={campaign.maxDiscount} onChange={(maxDiscount) => patch({ maxDiscount })} />
            <NumberField
              label="Spins each"
              value={campaign.spinsPerPerson}
              onChange={(spinsPerPerson) => patch({ spinsPerPerson })}
            />
            <NumberField
              label="Code lasts (days)"
              value={campaign.couponExpiryDays}
              onChange={(couponExpiryDays) => patch({ couponExpiryDays })}
            />
          </div>
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
            onClick={() =>
              patch({
                segments: defaultSegments(
                  campaign.minDiscount || 5,
                  campaign.maxDiscount || 10,
                  campaign.segments.length || 6,
                ),
              })
            }
          >
            Match slices to min and max
          </button>
          <div className="space-y-2">
            {campaign.segments.map((segment, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <NumberField
                  label={index === 0 ? "Slice %" : ""}
                  value={segment.discount}
                  onChange={(discount) => {
                    const segments = campaign.segments.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, discount, label: `${discount}%` } : row,
                    );
                    patch({ segments });
                  }}
                />
                <NumberField
                  label={index === 0 ? "Weight" : ""}
                  value={segment.weight}
                  onChange={(weight) => {
                    const segments = campaign.segments.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, weight } : row,
                    );
                    patch({ segments });
                  }}
                />
                <button
                  type="button"
                  className="mb-0.5 rounded-lg border border-border px-2 py-1.5 text-xs"
                  onClick={() => patch({ segments: campaign.segments.filter((_, rowIndex) => rowIndex !== index) })}
                  disabled={campaign.segments.length <= 2}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-semibold text-amber-800 dark:text-amber-200"
              onClick={() =>
                patch({
                  segments: [
                    ...campaign.segments,
                    { discount: campaign.minDiscount, weight: 1, label: `${campaign.minDiscount}%` },
                  ].slice(0, 12),
                })
              }
            >
              Add slice
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Who can see it
              <select
                value={campaign.audience}
                onChange={(event) => patch({ audience: event.target.value as Campaign["audience"] })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                <option value="all">Website visitors and members</option>
                <option value="visitors">Website visitors only</option>
                <option value="members">Member Portal only</option>
              </select>
            </label>
            <Field
              label="Plans, comma separated. Blank means every plan."
              value={plansText}
              onChange={setPlansText}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <DateField label="Starts" value={campaign.startsAt} onChange={(startsAt) => patch({ startsAt })} />
            <DateField label="Ends" value={campaign.endsAt} onChange={(endsAt) => patch({ endsAt })} />
            <NumberField
              label="Popup delay (seconds)"
              value={campaign.popupDelaySec}
              onChange={(popupDelaySec) => patch({ popupDelaySec })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberField
              label="Hide again after (hours)"
              value={campaign.cooldownHours}
              onChange={(cooldownHours) => patch({ cooldownHours })}
            />
            <Toggle
              label="Tap outside to close"
              checked={campaign.closeOverlay}
              onChange={(closeOverlay) => patch({ closeOverlay })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Gym Manager uses its own switch. A coupon is a code for the desk. It does not change a payment or the
            member’s plan amount.
          </p>
          {branches.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Branches</p>
              {branches.map((branch) => (
                <Toggle
                  key={branch.id}
                  label={branch.label}
                  checked={campaign.branchOverrides[branch.id]?.enabled !== false}
                  onChange={(enabled) =>
                    patch({
                      branchOverrides: { ...campaign.branchOverrides, [branch.id]: { enabled } },
                    })
                  }
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
              onClick={() => void save(campaign)}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
              onClick={() => setPreview(true)}
            >
              Preview
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
              onClick={() => {
                if (!window.confirm("Reset the wheel to 5%–10% and turn every surface off?")) return;
                const next = { ...EMPTY, segments: defaultSegments(5, 10, 6), branchOverrides: {} };
                setPlansText("");
                setCampaign(next);
                void save(next, "");
              }}
            >
              Reset
            </button>
          </div>
          <div className="space-y-2 rounded-2xl border border-border p-3">
            <p className="text-sm font-semibold">Check a coupon</p>
            <p className="text-xs text-muted-foreground">
              Marking a code redeemed does not save a payment. Type any discounted amount into Add Payment yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                placeholder="APG-XXXXXXXX"
                className="min-w-40 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-sm"
              />
              <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold" onClick={() => void lookupCoupon(false)}>
                Check
              </button>
              <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold" onClick={() => void lookupCoupon(true)}>
                Mark redeemed
              </button>
            </div>
            {couponNote ? <p className="text-sm">{couponNote}</p> : null}
          </div>
          <SpinWheelAnalytics branches={branches} />
        </div>
      ) : null}
      <SpinWheelModal
        open={preview}
        preview
        title={campaign.title}
        subtitle={campaign.subtitle}
        buttonLabel={campaign.buttonLabel}
        segments={campaign.segments}
        closeOverlay
        onClose={() => setPreview(false)}
      />
    </Card>
  );
}

function couponText(coupon: CouponView) {
  const plans = coupon.eligiblePlans?.length ? ` Plans: ${coupon.eligiblePlans.join(", ")}.` : "";
  return `${coupon.code} is ${coupon.status} at ${coupon.discount}%.${plans} This does not change a payment.`;
}

type CouponView = {
  code: string;
  discount: number;
  status: string;
  eligiblePlans?: string[];
};

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-black/[0.06] bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        className={cn("mt-1 h-4 w-4")}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label || "\u00a0"}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        type="datetime-local"
        value={toLocal(value)}
        onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function toLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
