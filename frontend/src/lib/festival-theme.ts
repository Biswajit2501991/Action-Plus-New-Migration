export const DURGA_PUJA_THEME = "durga_puja";
export const DIWALI_THEME = "diwali";
export type FestivalThemeId = "durga_puja" | "diwali";
export type FestivalSelectKey = "default" | FestivalThemeId;

export type FestivalThemeConfig = {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  apply_website: boolean;
  apply_gym_manager: boolean;
};

export type FestivalCatalog = Record<FestivalThemeId, FestivalThemeConfig>;

const IST_OFFSET = "+05:30";

export function emptyFestivalCatalog(): FestivalCatalog {
  return {
    durga_puja: {
      enabled: false,
      starts_at: null,
      ends_at: null,
      apply_website: true,
      apply_gym_manager: false,
    },
    diwali: {
      enabled: false,
      starts_at: null,
      ends_at: null,
      apply_website: true,
      apply_gym_manager: false,
    },
  };
}

export function istDatetimeLocalToIso(localValue: string): string {
  const v = String(localValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return "";
  const d = new Date(`${v}:00${IST_OFFSET}`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export function isoToIstDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function festivalStatusLabel(cfg: FestivalThemeConfig, now = Date.now()): string {
  if (!cfg.enabled) return "Disabled";
  const start = cfg.starts_at ? new Date(cfg.starts_at).getTime() : NaN;
  const end = cfg.ends_at ? new Date(cfg.ends_at).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Needs start and end in IST";
  if (now < start) return `Scheduled · ${formatIst(cfg.starts_at)} IST`;
  if (now >= end) return `Expired · ${formatIst(cfg.ends_at)} IST`;
  return `Active until ${formatIst(cfg.ends_at)} IST`;
}

export const PREVIEW_STORAGE_KEY = "apg-gym-festival-preview";
