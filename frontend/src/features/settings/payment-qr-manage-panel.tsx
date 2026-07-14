"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { paymentQrApi, type PaymentQrItem } from "@/services/api";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import type { GymCode } from "@/types";

type Props = {
  gymCodes: GymCode[];
};

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export function PaymentQrManagePanel({ gymCodes }: Props) {
  const user = useAuthStore((s) => s.user);
  const canManage = hasAccess(user, "paymentQr", "managePaymentSettings");
  const qc = useQueryClient();
  const defaultBranch = String(user?.activeBranchId || user?.gymCodeId || gymCodes[0]?.id || "");
  const [branchId, setBranchId] = useState(defaultBranch);
  const [qrName, setQrName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-qr-manage", branchId],
    queryFn: () =>
      paymentQrApi.list({
        gymCodeId: branchId || undefined,
        activeOnly: false,
        includeInactive: true,
      }),
    enabled: canManage && Boolean(branchId),
  });

  const items = useMemo(
    () => (Array.isArray(data?.items) ? data!.items! : []) as PaymentQrItem[],
    [data?.items],
  );

  if (!canManage) return null;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["payment-qr-manage"] });
    await qc.invalidateQueries({ queryKey: ["payment-qr"] });
  };

  const create = async () => {
    const name = qrName.trim();
    if (!name) {
      toast.error("QR name is required.");
      return;
    }
    if (!branchId) {
      toast.error("Gym branch is required.");
      return;
    }
    if (!image) {
      toast.error("QR image is required.");
      return;
    }
    setSaving(true);
    try {
      const created = await paymentQrApi.create({
        qrName: name,
        gymCodeId: branchId,
        isActive: true,
      });
      const id = String(created?.item?.id || "").trim();
      if (id) await paymentQrApi.uploadImage(id, image, branchId);
      toast.success("Payment QR created");
      setQrName("");
      setImage("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: PaymentQrItem) => {
    try {
      await paymentQrApi.update(String(item.id), {
        isActive: !item.isActive,
        gymCodeId: item.gymCodeId || branchId,
      });
      toast.success(item.isActive ? "QR deactivated" : "QR activated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-sky-200/70 bg-gradient-to-b from-sky-50/40 to-white p-4 dark:border-sky-900/40 dark:from-sky-950/20 dark:to-card">
      <div>
        <h3 className="text-sm font-semibold">Payment QR management</h3>
        <p className="text-xs text-muted-foreground">
          Upload and manage branch Payment QR images shown to members.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Branch</label>
          <Select
            className="mt-1"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {gymCodes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code || g.name || g.label || g.id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">QR name</label>
          <Input
            className="mt-1"
            value={qrName}
            onChange={(e) => setQrName(e.target.value)}
            placeholder="UPI / Main desk"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">QR image</label>
          <Input
            className="mt-1"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void fileToDataUrl(file)
                .then(setImage)
                .catch((err) =>
                  toast.error(err instanceof Error ? err.message : "Could not read image"),
                );
            }}
          />
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="QR preview" className="mt-2 h-28 w-28 rounded-xl border object-contain" />
          ) : null}
        </div>
      </div>
      <Button size="sm" onClick={() => void create()} disabled={saving}>
        {saving ? "Saving…" : "Create Payment QR"}
      </Button>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Existing QRs {isLoading ? "(loading…)" : `(${items.length})`}
        </p>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{item.qrName || item.id}</p>
              <p className="text-xs text-muted-foreground">
                {item.isActive === false ? "Inactive" : "Active"}
                {item.branchLabel ? ` · ${item.branchLabel}` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void toggleActive(item)}>
              {item.isActive === false ? "Activate" : "Deactivate"}
            </Button>
          </div>
        ))}
        {!items.length && !isLoading ? (
          <p className="text-xs text-muted-foreground">No Payment QR records for this branch.</p>
        ) : null}
      </div>
    </div>
  );
}
