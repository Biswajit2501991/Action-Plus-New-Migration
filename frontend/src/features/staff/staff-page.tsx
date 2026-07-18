"use client";

import { Fragment, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronDown, ChevronUp, Eye, EyeOff, Plus } from "lucide-react";
import { PageHeader, Badge, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { StaffAvatar } from "@/components/staff-avatar";
import { PhotoSourcePickerModal } from "@/features/members/member-photo-modals";
import { useGymCodes, useUsers } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { compressMemberPhotoFile } from "@/lib/domain/member-photo-compress";
import { logsApi, usersApi } from "@/services/api";
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
import { useAuthStore, useBranchStore } from "@/stores";
import type { AccessMap, GymCode, StaffUser } from "@/types";

function resolveActiveBranchId() {
  return String(
    useBranchStore.getState().activeBranchId
      || useAuthStore.getState().user?.activeBranchId
      || useAuthStore.getState().user?.gymCodeId
      || "",
  ).trim();
}

type StaffForm = {
  id: string;
  name: string;
  email: string;
  password: string;
  staffRole: "staff" | "branch_owner";
  gymCodeId: string;
  assignedBranchIds: string[];
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
  assignedBranchIds: [],
  sections: ["Dashboard", "Members"],
  blocked: false,
  access: normalizeAccess(DEFAULT_ACCESS),
  photoDataUrl: "",
};

function gymLabel(code: {
  code?: string;
  name?: string;
  label?: string;
  branchName?: string;
  id?: string;
}) {
  const name = code.name || code.label || code.branchName;
  return code.code ? `${code.code}${name ? ` / ${name}` : ""}` : name || code.id || "—";
}

function staffPasswordDisplay(u: StaffUser, shown: boolean) {
  const plain = String(u.password || "").trim();
  if (!shown) return "••••••••";
  if (plain) return plain;
  if (u.hasPassword) return "(set — save a new password to view)";
  return "(not set)";
}

function staffAssignedIds(u: StaffUser): string[] {
  if (Array.isArray(u.assignedBranchIds) && u.assignedBranchIds.length) {
    return u.assignedBranchIds.map((id) => String(id || "").trim()).filter(Boolean);
  }
  const single = String(u.gymCodeId || u.homeBranchId || "").trim();
  return single ? [single] : [];
}

function staffBranchesSummary(u: StaffUser, gymCodes: GymCode[]) {
  const ids = staffAssignedIds(u);
  if (!ids.length) return "—";
  return ids
    .map((id) => {
      const g = gymCodes.find((c) => String(c.id) === String(id));
      return g ? gymLabel(g) : id;
    })
    .join(", ");
}

function staffRoleLabel(u: StaffUser) {
  const r = String(u.staffRole || u.role || "staff").toLowerCase();
  if (u.id === "owner" || r === "master_owner") return "Master";
  if (r === "branch_owner") return "Branch Owner";
  return "Staff";
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
  const [shownPasswords, setShownPasswords] = useState<Record<string, boolean>>({});
  const [showEditCurrentPassword, setShowEditCurrentPassword] = useState(false);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

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

  const showOwnerMultiBranch =
    isOwner && (creating ? form.id.trim() !== "owner" : editingId !== "owner");

  const toggleShowPassword = (u: StaffUser) => {
    const nextShown = !shownPasswords[u.id];
    setShownPasswords((prev) => ({ ...prev, [u.id]: nextShown }));
    void logsApi
      .create({
        action: "staff.password.view_toggled",
        entityType: "user",
        entityId: u.id,
        meta: { shown: nextShown },
      })
      .catch(() => {});
  };

  const toggleAssignedBranch = (branchId: string) => {
    const id = String(branchId || "").trim();
    if (!id) return;
    setForm((prev) => {
      const current = Array.isArray(prev.assignedBranchIds) ? [...prev.assignedBranchIds] : [];
      const has = current.includes(id);
      const nextIds = has ? current.filter((x) => x !== id) : [...current, id];
      let nextGym = prev.gymCodeId;
      if (!nextIds.length) nextGym = "";
      else if (!nextIds.includes(String(prev.gymCodeId || ""))) nextGym = nextIds[0];
      return { ...prev, assignedBranchIds: nextIds, gymCodeId: nextGym };
    });
  };

  const openCreate = (preset?: RoleTemplate) => {
    if (!canManage) return;
    const defaultBranch = String(user?.gymCodeId || gymCodes[0]?.id || "");
    setCreating(true);
    setEditingId(null);
    setFormError("");
    setShowEditCurrentPassword(false);
    setForm({
      ...EMPTY_FORM,
      gymCodeId: defaultBranch,
      assignedBranchIds: defaultBranch ? [defaultBranch] : [],
      sections: preset?.sections?.length ? [...preset.sections] : EMPTY_FORM.sections,
      access: normalizeAccess(DEFAULT_ACCESS),
    });
  };

  const openEdit = (u: StaffUser) => {
    if (!canManage) return;
    const assigned = staffAssignedIds(u);
    const defaultBranch = String(u.gymCodeId || assigned[0] || "");
    setCreating(false);
    setEditingId(u.id);
    setFormError("");
    setShowEditCurrentPassword(false);
    setForm({
      id: u.id,
      name: u.name || "",
      email: u.email || "",
      password: "",
      staffRole: u.staffRole === "branch_owner" ? "branch_owner" : "staff",
      gymCodeId: defaultBranch,
      assignedBranchIds: assigned.length ? assigned : defaultBranch ? [defaultBranch] : [],
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
    setShowEditCurrentPassword(false);
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

      const before = editingId ? users.find((u) => u.id === editingId) : null;
      const staffRole =
        id === "owner" ? "master_owner" : isOwner ? form.staffRole : "staff";

      const formBranchIds = (Array.isArray(form.assignedBranchIds) ? form.assignedBranchIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      let assignedBranchIds: string[] = [];
      let gymCodeId: string | null = form.gymCodeId || before?.gymCodeId || null;

      if (id === "owner") {
        assignedBranchIds = [];
        gymCodeId = null;
      } else if (staffRole === "branch_owner") {
        assignedBranchIds = formBranchIds;
        if (!assignedBranchIds.length) {
          throw new Error("Branch Owner must be assigned to at least one gym branch.");
        }
        if (!gymCodeId || !assignedBranchIds.includes(String(gymCodeId))) {
          gymCodeId = assignedBranchIds[0];
        }
      } else if (isOwner && formBranchIds.length > 0) {
        assignedBranchIds = formBranchIds;
        if (!gymCodeId || !assignedBranchIds.includes(String(gymCodeId))) {
          gymCodeId = assignedBranchIds[0];
        }
      } else {
        assignedBranchIds = gymCodeId ? [String(gymCodeId)] : [];
      }

      if (id !== "owner" && !gymCodeId) {
        throw new Error("Please assign this staff member to a gym branch (gym code).");
      }

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
    onSuccess: async (saved) => {
      const active = resolveActiveBranchId();
      const staffBranches = [
        ...(Array.isArray(saved?.assignedBranchIds) ? saved.assignedBranchIds : []),
        saved?.gymCodeId,
      ]
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      const branchSet = new Set(staffBranches);
      const onOtherBranch =
        Boolean(active) && branchSet.size > 0 && !branchSet.has(active);
      if (creating && onOtherBranch) {
        const labels = staffBranches
          .map((id) => {
            const g = gymCodes.find((c) => String(c.id) === id);
            return g ? gymLabel(g) : null;
          })
          .filter(Boolean);
        const where = labels.length ? labels.join(", ") : "their assigned branch";
        toast.success(`Staff created — switch the top branch switcher to ${where} to see them in this list.`);
      } else {
        toast.success(creating ? "Staff created" : "Staff updated");
      }
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
            : "No staff removed",
      );
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const colSpan = (isOwner ? 5 : 4) + 1;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <PageHeader
        title="Staff"
        description="Roles, branch assignment, section access, and staff accounts."
        actions={
          canManage ? (
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" /> Add Staff
            </Button>
          ) : null
        }
      />

      <RoleTemplatesPanel onUseTemplate={(role) => openCreate(role)} />

      <Card className="border-slate-200 shadow-sm dark:border-border">
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Staff</th>
                {isOwner ? <th className="px-4 py-3 font-semibold">Password</th> : null}
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Branches</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">More</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const shown = Boolean(shownPasswords[u.id]);
                const expanded = expandedStaffId === u.id;
                const branchesLabel = staffBranchesSummary(u, gymCodes);
                return (
                  <Fragment key={u.id}>
                    <tr className="border-t border-slate-100 dark:border-border">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                          <StaffAvatar user={u} className="h-8 w-8 shrink-0 text-[10px]" />
                          <span className="truncate font-medium text-slate-900 dark:text-slate-50">
                            {u.name || u.id}
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {u.id}
                              {u.email ? ` · ${u.email}` : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      {isOwner ? (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-800 dark:text-slate-200">
                              {staffPasswordDisplay(u, shown)}
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                              onClick={() => toggleShowPassword(u)}
                            >
                              {shown ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              {shown ? "Hide" : "Show"}
                            </button>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{staffRoleLabel(u)}</td>
                      <td
                        className="max-w-[14rem] truncate px-4 py-3 text-xs text-slate-700 dark:text-slate-300"
                        title={branchesLabel}
                      >
                        {branchesLabel}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.blocked ? "danger" : "success"}>
                          {u.blocked ? "Blocked" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          onClick={() =>
                            setExpandedStaffId((prev) => (prev === u.id ? null : u.id))
                          }
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          {expanded ? "Less" : "More"}
                        </Button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-t border-slate-100 bg-slate-50/70 dark:border-border dark:bg-white/[0.03]">
                        <td colSpan={colSpan} className="px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              <p>
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  Email:{" "}
                                </span>
                                {u.email || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  Sections:{" "}
                                </span>
                                {(u.sections || []).join(", ") || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  Assigned branches:{" "}
                                </span>
                                {branchesLabel}
                              </p>
                              <p>
                                <span className="font-medium text-slate-800 dark:text-slate-100">
                                  Default branch at login:{" "}
                                </span>
                                {(() => {
                                  const g = gymCodes.find(
                                    (c) => String(c.id) === String(u.gymCodeId || ""),
                                  );
                                  return g ? gymLabel(g) : u.gymCodeId || "—";
                                })()}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {canManage ? (
                                <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                                  Edit
                                </Button>
                              ) : null}
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
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!users.length ? (
            <div className="p-6">
              <EmptyState
                title="No staff found"
                description="Create a staff account to get started."
              />
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
                  Username, branches, sections, and optional password.
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
                    autoComplete="new-password"
                  />
                  {!creating && isOwner && editingUser ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                      <span className="text-muted-foreground">Current:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {staffPasswordDisplay(editingUser, showEditCurrentPassword)}
                      </span>
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                        onClick={() => {
                          const next = !showEditCurrentPassword;
                          setShowEditCurrentPassword(next);
                          void logsApi
                            .create({
                              action: "staff.password.view_toggled",
                              entityType: "user",
                              entityId: editingUser.id,
                              meta: { shown: next, source: "edit-modal" },
                            })
                            .catch(() => {});
                        }}
                      >
                        {showEditCurrentPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        {showEditCurrentPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  ) : null}
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
                {isOwner && showOwnerMultiBranch ? (
                  <div className="md:col-span-2">
                    <Label>Access role</Label>
                    <Select
                      className="mt-1"
                      value={form.staffRole}
                      onChange={(e) => {
                        const nextRole = e.target.value as "staff" | "branch_owner";
                        setForm((prev) => {
                          const branch = prev.gymCodeId || String(gymCodes[0]?.id || "");
                          const assigned = Array.isArray(prev.assignedBranchIds)
                            ? [...prev.assignedBranchIds]
                            : [];
                          if (nextRole === "branch_owner") {
                            const nextAssigned = assigned.length
                              ? assigned
                              : branch
                                ? [branch]
                                : [];
                            return {
                              ...prev,
                              staffRole: nextRole,
                              assignedBranchIds: nextAssigned,
                              gymCodeId: nextAssigned.includes(prev.gymCodeId)
                                ? prev.gymCodeId
                                : nextAssigned[0] || "",
                            };
                          }
                          const single = branch || assigned[0] || "";
                          return {
                            ...prev,
                            staffRole: "staff",
                            gymCodeId: single,
                            assignedBranchIds:
                              assigned.length > 1 ? assigned : single ? [single] : [],
                          };
                        });
                      }}
                    >
                      <option value="staff">Staff</option>
                      <option value="branch_owner">Branch Owner (admin)</option>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use checkboxes below for multi-branch access. Branch Owner can manage staff
                      in assigned branches.
                    </p>
                  </div>
                ) : null}
              </div>

              {showOwnerMultiBranch ? (
                <div className="space-y-3">
                  <div>
                    <Label>
                      Assigned branches <span className="text-rose-500">*</span>
                    </Label>
                    <div
                      className="mt-1 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-300 bg-white p-2 dark:border-border dark:bg-background"
                      data-testid="staff-assigned-branches"
                    >
                      {gymCodes.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"
                        >
                          <input
                            type="checkbox"
                            checked={form.assignedBranchIds.includes(String(c.id))}
                            onChange={() => toggleAssignedBranch(String(c.id))}
                          />
                          <span>{gymLabel(c)}</span>
                        </label>
                      ))}
                      {!gymCodes.length ? (
                        <p className="px-1 py-2 text-xs text-muted-foreground">No gym codes yet.</p>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select one or more branches. Staff with multiple branches can switch from the
                      top-right profile menu after login.
                    </p>
                  </div>
                  <div>
                    <Label>
                      Default branch at login <span className="text-rose-500">*</span>
                    </Label>
                    <Select
                      className="mt-1"
                      value={form.gymCodeId}
                      onChange={(e) => setForm((f) => ({ ...f, gymCodeId: e.target.value }))}
                      data-testid="staff-gym-code-select"
                      required
                    >
                      <option value="">Select default branch…</option>
                      {form.assignedBranchIds.map((branchId) => {
                        const c = gymCodes.find((g) => String(g.id) === String(branchId));
                        if (!c) return null;
                        return (
                          <option key={c.id} value={String(c.id)}>
                            {gymLabel(c)}
                          </option>
                        );
                      })}
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Which branch they land on after login. They can still switch to any assigned
                      branch from the top-right menu.
                    </p>
                  </div>
                </div>
              ) : editingId !== "owner" && !(creating && form.id.trim() === "owner") ? (
                <div>
                  <Label>
                    Gym Branch (Gym Code) <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    className="mt-1"
                    value={form.gymCodeId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        gymCodeId: next,
                        assignedBranchIds: next ? [next] : [],
                      }));
                    }}
                    data-testid="staff-gym-code-select"
                    required
                  >
                    <option value="">Select a branch…</option>
                    {gymCodes.map((g) => (
                      <option key={g.id} value={String(g.id)}>
                        {gymLabel(g)}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Staff will only see members assigned to this branch.
                  </p>
                </div>
              ) : null}

              <StaffSectionsAccessEditor
                sections={form.sections}
                access={form.access}
                expandAllOnMount
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
