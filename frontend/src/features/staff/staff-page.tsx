"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Plus } from "lucide-react";
import { PageHeader, Badge, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { StaffAvatar } from "@/components/staff-avatar";
import { PhotoSourcePickerModal } from "@/features/members/member-photo-modals";
import { useGymCodes, useUsers } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { compressMemberPhotoFile } from "@/lib/domain/member-photo-compress";
import { usersApi } from "@/services/api";
import { adminSetPassword } from "@/services/api/auth";
import {
  DEFAULT_ACCESS,
  isBranchAdminUser,
  isMasterOwnerUser,
  normalizeAccess,
  type RoleTemplate,
} from "@/lib/domain/permissions";
import { StaffSectionsAccessEditor } from "@/features/staff/staff-sections-access";
import { RoleTemplatesPanel } from "@/features/staff/role-templates-panel";
import { useAuthStore } from "@/stores";
import type { AccessMap, StaffUser } from "@/types";

type StaffForm = {
  id: string;
  name: string;
  email: string;
  password: string;
  staffRole: "staff" | "branch_owner";
  gymCodeId: string;
  sections: string[];
  blocked: boolean;
  access: AccessMap;
  /** New upload as data URL; empty = keep existing. */
  photoDataUrl: string;
};

const EMPTY_FORM: StaffForm = {
  id: "",
  name: "",
  email: "",
  password: "",
  staffRole: "staff",
  gymCodeId: "",
  sections: ["Dashboard", "Members"],
  blocked: false,
  access: normalizeAccess(DEFAULT_ACCESS),
  photoDataUrl: "",
};

function gymLabel(code: { code?: string; name?: string; label?: string; id?: string }) {
  return code.code
    ? `${code.code}${code.name || code.label ? ` / ${code.name || code.label}` : ""}`
    : code.name || code.label || code.id || "—";
}

export function StaffPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useUsers();
  const { data: gymCodes = [] } = useGymCodes();
  useStaffPhotoHydration(users);

  const isOwner = isMasterOwnerUser(user);
  const canManage = isBranchAdminUser(user);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  const editingUser = useMemo(
    () => (editingId ? users.find((u) => u.id === editingId) || null : null),
    [editingId, users],
  );

  const previewUser = useMemo(() => {
    if (form.photoDataUrl) {
      return {
        ...(editingUser || {}),
        id: form.id || editingUser?.id || "preview",
        name: form.name || editingUser?.name,
        photo: form.photoDataUrl,
      } as StaffUser;
    }
    return editingUser;
  }, [editingUser, form.photoDataUrl, form.id, form.name]);

  const openCreate = (preset?: RoleTemplate) => {
    if (!canManage) return;
    setCreating(true);
    setEditingId(null);
    setFormError("");
    setForm({
      ...EMPTY_FORM,
      gymCodeId: String(user?.gymCodeId || gymCodes[0]?.id || ""),
      sections: preset?.sections?.length ? [...preset.sections] : EMPTY_FORM.sections,
      access: normalizeAccess(DEFAULT_ACCESS),
    });
  };

  const openEdit = (u: StaffUser) => {
    if (!canManage) return;
    setCreating(false);
    setEditingId(u.id);
    setFormError("");
    setForm({
      id: u.id,
      name: u.name || "",
      email: u.email || "",
      password: "",
      staffRole: u.staffRole === "branch_owner" ? "branch_owner" : "staff",
      gymCodeId: String(u.gymCodeId || u.homeBranchId || ""),
      sections: Array.isArray(u.sections) ? [...u.sections] : [],
      blocked: Boolean(u.blocked),
      access: normalizeAccess(u.access),
      photoDataUrl: "",
    });
  };

  const closeModal = () => {
    setCreating(false);
    setEditingId(null);
    setFormError("");
    setForm(EMPTY_FORM);
    setPhotoPickerOpen(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const id = form.id.trim();
      const name = form.name.trim();
      const password = form.password.trim();
      if (!id || !name || (creating && !password)) {
        throw new Error("Please enter a username, password and name.");
      }
      if (creating && users.some((u) => u.id === id)) {
        throw new Error("A staff member with this username already exists.");
      }
      if (!form.sections.length) throw new Error("Please select at least one section.");
      if (id !== "owner" && !form.gymCodeId) {
        throw new Error("Please assign this staff member to a gym branch.");
      }

      const before = editingId ? users.find((u) => u.id === editingId) : null;
      const staffRole =
        id === "owner" ? "master_owner" : isOwner ? form.staffRole : "staff";
      const gymCodeId = id === "owner" ? null : form.gymCodeId;
      const assignedBranchIds = gymCodeId ? [String(gymCodeId)] : [];

      const updatedUser: StaffUser = {
        ...(before || {}),
        id,
        name,
        email: form.email.trim(),
        sections: [...form.sections],
        access: normalizeAccess(form.access),
        blocked: Boolean(form.blocked),
        staffRole,
        gymCodeId: gymCodeId || undefined,
        assignedBranchIds,
        syncBranchAssignments: id !== "owner",
        updatedAt: new Date().toISOString(),
      };

      await usersApi.upsert(updatedUser);
      if (password && id !== "owner") {
        await adminSetPassword(id, password);
      }
      if (form.photoDataUrl.startsWith("data:")) {
        try {
          await usersApi.uploadPhoto(id, form.photoDataUrl);
        } catch {
          toast.message("Staff saved, but photo upload failed — try again from Edit.");
        }
      }
      return updatedUser;
    },
    onSuccess: async () => {
      toast.success(creating ? "Staff created" : "Staff updated");
      closeModal();
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => {
      setFormError(e.message || "Save failed");
      toast.error(e.message || "Save failed");
    },
  });

  const toggleBlock = useMutation({
    mutationFn: async (target: StaffUser) => {
      if (!isOwner) throw new Error("Only owner can block/unblock staff");
      await usersApi.upsert({
        ...target,
        blocked: !target.blocked,
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      toast.success("Staff status updated");
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStaff = useMutation({
    mutationFn: async (target: StaffUser) => {
      if (!isOwner) throw new Error("Only owner can delete staff");
      return usersApi.cleanup([target.id]);
    },
    onSuccess: async (res) => {
      const deleted = res.deleted?.length || 0;
      const deactivated = res.deactivated?.length || 0;
      toast.success(
        deleted
          ? "Staff deleted"
          : deactivated
            ? "Staff deactivated (has history)"
            : "No changes",
      );
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Staff management is limited to owners and branch owners.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description="Roles, branch assignment, section access, and staff accounts."
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        }
      />

      <RoleTemplatesPanel onUseTemplate={(role) => openCreate(role)} />

      <Card className="border-slate-200 shadow-sm dark:border-border">
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 font-semibold">Sections</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const branch = gymCodes.find(
                  (g) => String(g.id) === String(u.gymCodeId || u.homeBranchId || ""),
                );
                return (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StaffAvatar user={u} className="h-8 w-8 text-[10px]" />
                        <div>
                          <div className="font-medium">{u.name || u.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.id}
                            {u.email ? ` · ${u.email}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {u.staffRole || u.role || "staff"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {branch ? gymLabel(branch) : u.gymCodeId || "—"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-muted-foreground">
                      {(u.sections || []).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.blocked ? "danger" : "success"}>
                        {u.blocked ? "Blocked" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                        {isOwner && u.id !== "owner" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleBlock.mutate(u)}
                            >
                              {u.blocked ? "Unblock" : "Block"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-700"
                              onClick={() => {
                                if (confirm(`Delete or deactivate ${u.name || u.id}?`)) {
                                  removeStaff.mutate(u);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users.length ? (
            <div className="p-6">
              <EmptyState title="No staff found" description="Create a staff account to get started." />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {creating || editingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div
            className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-edit-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 id="staff-edit-title" className="text-lg font-semibold">
                  {creating ? "Add Staff" : `Edit · ${editingId}`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Username, branch, sections, and optional password.
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={closeModal}>
                ✕
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <StaffAvatar user={previewUser} className="h-16 w-16 text-base" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Staff photo
                  </p>
                  <p className="text-xs text-slate-500">
                    Upload or take a photo. Saved after you tap Save.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPhotoPickerOpen(true)}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {form.photoDataUrl || previewUser?.photoUrl || previewUser?.photo
                        ? "Change photo"
                        : "Upload photo"}
                    </Button>
                    {form.photoDataUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm((f) => ({ ...f, photoDataUrl: "" }))}
                      >
                        Clear new photo
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Username</Label>
                  <Input
                    className="mt-1"
                    value={form.id}
                    disabled={!creating}
                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{creating ? "Password" : "New password (optional)"}</Label>
                  <Input
                    className="mt-1"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    className="mt-1"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    className="mt-1"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Gym Branch</Label>
                  <Select
                    className="mt-1"
                    value={form.gymCodeId}
                    onChange={(e) => setForm((f) => ({ ...f, gymCodeId: e.target.value }))}
                  >
                    <option value="">Select branch…</option>
                    {gymCodes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {gymLabel(g)}
                      </option>
                    ))}
                  </Select>
                </div>
                {isOwner ? (
                  <div>
                    <Label>Staff role</Label>
                    <Select
                      className="mt-1"
                      value={form.staffRole}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          staffRole: e.target.value as "staff" | "branch_owner",
                        }))
                      }
                    >
                      <option value="staff">Staff</option>
                      <option value="branch_owner">Branch Owner</option>
                    </Select>
                  </div>
                ) : null}
              </div>

              <StaffSectionsAccessEditor
                sections={form.sections}
                access={form.access}
                onChange={(next) =>
                  setForm((f) => ({
                    ...f,
                    sections: next.sections,
                    access: normalizeAccess(next.access),
                  }))
                }
              />

              {isOwner && form.id !== "owner" ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.blocked}
                    onChange={(e) => setForm((f) => ({ ...f, blocked: e.target.checked }))}
                  />
                  Block this account
                </label>
              ) : null}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-5 py-3">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PhotoSourcePickerModal
        open={photoPickerOpen}
        title="Staff photo"
        onClose={() => setPhotoPickerOpen(false)}
        onPickFile={async (file) => {
          try {
            const compressed = await compressMemberPhotoFile(file);
            setForm((f) => ({ ...f, photoDataUrl: compressed }));
            toast.success("Photo ready — save to upload");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not read photo");
          }
        }}
      />
    </div>
  );
}
