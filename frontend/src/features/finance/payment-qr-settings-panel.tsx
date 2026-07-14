"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useGymCodes } from "@/hooks/use-data";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { cn, uid } from "@/lib/utils";
import { paymentQrApi, type PaymentQrItem } from "@/services/api";
import { useAuthStore } from "@/stores";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

type Draft = {
  id?: string;
  qrName: string;
  gymCodeId: string;
  displayOrder: string;
  isActive: boolean;
  imageDataUrl: string;
};

const EMPTY: Draft = {
  qrName: "",
  gymCodeId: "",
  displayOrder: "0",
  isActive: true,
  imageDataUrl: "",
};

export function PaymentQrSettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: gymCodes = [] } = useGymCodes();
  const canManage =
    isMasterOwnerUser(user) || hasAccess(user, "paymentQr", "managePaymentSettings");
  const branchId = String(user?.activeBranchId || user?.gymCodeId || "");

  const [branchFilter, setBranchFilter] = useState(branchId);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-qr-manage", branchFilter],
    queryFn: () =>
      paymentQrApi.list({
        gymCodeId: branchFilter || undefined,
        activeOnly: false,
        includeInactive: true,
      }),
    enabled: canManage,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);

  const save = useMutation({
    mutationFn: async () => {
      const name = draft.qrName.trim();
      if (!name) throw new Error("QR name is required");
      if (!draft.gymCodeId) throw new Error("Branch is required");
      if (!draft.id && !draft.imageDataUrl) throw new Error("QR image is required");

      let id = draft.id;
      if (!id) {
        const created = await paymentQrApi.create({
          id: uid("pqr"),
          qrName: name,
          gymCodeId: draft.gymCodeId,
          displayOrder: Number(draft.displayOrder) || 0,
          isActive: draft.isActive,
        });
        id = String(created?.item?.id || created?.item?.["id"] || "").trim();
        if (!id) {
          // Some backends return the item at top level
          id = String((created as { id?: string })?.id || "").trim();
        }
        if (!id) throw new Error("Could not create payment QR");
        if (draft.imageDataUrl) {
          await paymentQrApi.uploadImage(id, draft.imageDataUrl, draft.gymCodeId);
        }
      } else {
        await paymentQrApi.update(id, {
          qrName: name,
          gymCodeId: draft.gymCodeId,
          displayOrder: Number(draft.displayOrder) || 0,
          isActive: draft.isActive,
        });
        if (draft.imageDataUrl) {
          await paymentQrApi.uploadImage(id, draft.imageDataUrl, draft.gymCodeId);
        }
      }
    },
    onSuccess: async () => {
      toast.success(draft.id ? "Payment QR updated" : "Payment QR created");
      setFormOpen(false);
      setDraft(EMPTY);
      await qc.invalidateQueries({ queryKey: ["payment-qr-manage"] });
      await qc.invalidateQueries({ queryKey: ["payment-qr"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Payment QR settings are available to owners with manage permission.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payment QR"
        description="Manage branch collection QR codes shown to staff and in reminders."
        actions={
          <Button
            onClick={() => {
              setDraft({
                ...EMPTY,
                gymCodeId: branchFilter || branchId || String(gymCodes[0]?.id || ""),
              });
              setFormOpen(true);
            }}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            <QrCode className="h-4 w-4" />
            Add QR
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-slate-500">Branch</Label>
        <Select
          className="w-56"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="">All branches</option>
          {gymCodes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code || g.name || g.id}
            </option>
          ))}
        </Select>
      </div>

      {!items.length ? (
        <EmptyState title="No payment QR codes" description="Add a UPI / collection QR for a branch." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item: PaymentQrItem) => (
            <Card key={String(item.id)} className="overflow-hidden">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-50">
                      {item.qrName || "Payment QR"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.branchLabel || item.gymCodeId || "—"} · order{" "}
                      {item.displayOrder ?? 0}
                    </p>
                  </div>
                  <Badge variant={item.isActive === false ? "muted" : "success"}>
                    {item.isActive === false ? "Inactive" : "Active"}
                  </Badge>
                </div>
                <div
                  className={cn(
                    "flex h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]",
                  )}
                >
                  {item.qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={String(item.qrImageUrl)}
                      alt={String(item.qrName || "QR")}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-slate-300" />
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setDraft({
                      id: String(item.id),
                      qrName: String(item.qrName || ""),
                      gymCodeId: String(item.gymCodeId || ""),
                      displayOrder: String(item.displayOrder ?? 0),
                      isActive: item.isActive !== false,
                      imageDataUrl: "",
                    });
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ClassicalModal
        open={formOpen}
        title={draft.id ? "Edit payment QR" : "Add payment QR"}
        description="Upload a clear square QR image. Staff can open it from Members."
        onClose={() => {
          setFormOpen(false);
          setDraft(EMPTY);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setFormOpen(false);
                setDraft(EMPTY);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>QR name</Label>
            <Input
              className="mt-1"
              value={draft.qrName}
              onChange={(e) => setDraft({ ...draft, qrName: e.target.value })}
              placeholder="Main UPI QR"
            />
          </div>
          <div>
            <Label>Branch</Label>
            <Select
              className="mt-1"
              value={draft.gymCodeId}
              onChange={(e) => setDraft({ ...draft, gymCodeId: e.target.value })}
            >
              <option value="">Select branch</option>
              {gymCodes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code || g.name || g.id}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Display order</Label>
              <Input
                className="mt-1"
                type="number"
                value={draft.displayOrder}
                onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                className="mt-1"
                value={draft.isActive ? "active" : "inactive"}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>QR image {draft.id ? "(optional replace)" : "*"}</Label>
            <Input
              className="mt-1"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void readFileAsDataUrl(file)
                  .then((imageDataUrl) => setDraft((d) => ({ ...d, imageDataUrl })))
                  .catch((err: Error) => toast.error(err.message));
              }}
            />
            {draft.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.imageDataUrl}
                alt="Preview"
                className="mt-2 h-28 w-28 rounded-xl border object-contain"
              />
            ) : null}
          </div>
        </div>
      </ClassicalModal>
    </div>
  );
}
