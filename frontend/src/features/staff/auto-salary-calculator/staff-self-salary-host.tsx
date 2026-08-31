"use client";

import { useUiStore } from "@/stores";
import { StaffSelfSalaryModal } from "./staff-self-salary-modal";

export function StaffSelfSalaryHost() {
  const open = useUiStore((s) => s.selfSalaryModalOpen);
  const setOpen = useUiStore((s) => s.setSelfSalaryModalOpen);

  if (!open) return null;

  return (
    <StaffSelfSalaryModal
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
