export const DURGA_PUJA_THEME = "durga_puja";
export const DIWALI_THEME = "diwali";
export const CHHATH_PUJA_THEME = "chhath_puja";
export const NEW_YEAR_2027_THEME = "new_year_2027";
export const HOLI_2027_THEME = "holi_2027";
export const FESTIVAL_THEMES = [DURGA_PUJA_THEME, DIWALI_THEME, CHHATH_PUJA_THEME, NEW_YEAR_2027_THEME, HOLI_2027_THEME];

function emptyTheme() {
  return {
    enabled: false,
    starts_at: null,
    ends_at: null,
    apply_website: true,
    apply_gym_manager: false,
  };
}

function asIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseTheme(raw) {
  const base = emptyTheme();
  if (!raw || typeof raw !== "object") return base;
  return {
    enabled: Boolean(raw.enabled),
    starts_at: asIso(raw.starts_at),
    ends_at: asIso(raw.ends_at),
    apply_website: raw.apply_website !== false,
    apply_gym_manager: Boolean(raw.apply_gym_manager),
  };
}

export function emptyFestivalCatalog() {
  return {
    durga_puja: emptyTheme(),
    diwali: emptyTheme(),
    chhath_puja: emptyTheme(),
    new_year_2027: emptyTheme(),
    holi_2027: emptyTheme(),
  };
}

export function hydrateFestivalCatalog(settings = {}) {
  const catalog = emptyFestivalCatalog();
  const raw = settings.festival_catalog;
  if (raw && typeof raw === "object") {
    catalog.durga_puja = parseTheme(raw.durga_puja);
    catalog.diwali = parseTheme(raw.diwali);
    catalog.chhath_puja = parseTheme(raw.chhath_puja);
    catalog.new_year_2027 = parseTheme(raw.new_year_2027);
    catalog.holi_2027 = parseTheme(raw.holi_2027);
  }
  const catalogMissing = !raw || typeof raw !== "object" || Object.keys(raw).length === 0;
  if (catalogMissing) {
    const theme = String(settings.festival_theme || "");
    catalog.durga_puja = {
      enabled:
        Boolean(settings.festival_enabled) && (theme === DURGA_PUJA_THEME || theme === ""),
      starts_at: asIso(settings.festival_starts_at),
      ends_at: asIso(settings.festival_ends_at),
      apply_website: true,
      apply_gym_manager: false,
    };
    if (theme === DIWALI_THEME) {
      catalog.durga_puja.enabled = false;
      catalog.diwali = {
        enabled: Boolean(settings.festival_enabled),
        starts_at: asIso(settings.festival_starts_at),
        ends_at: asIso(settings.festival_ends_at),
        apply_website: true,
        apply_gym_manager: false,
      };
    }
    if (theme === CHHATH_PUJA_THEME) {
      catalog.durga_puja.enabled = false;
      catalog.chhath_puja = {
        enabled: Boolean(settings.festival_enabled),
        starts_at: asIso(settings.festival_starts_at),
        ends_at: asIso(settings.festival_ends_at),
        apply_website: true,
        apply_gym_manager: false,
      };
    }
    if (theme === NEW_YEAR_2027_THEME) {
      catalog.durga_puja.enabled = false;
      catalog.new_year_2027 = {
        enabled: Boolean(settings.festival_enabled),
        starts_at: asIso(settings.festival_starts_at),
        ends_at: asIso(settings.festival_ends_at),
        apply_website: true,
        apply_gym_manager: false,
      };
    }
    if (theme === HOLI_2027_THEME) {
      catalog.durga_puja.enabled = false;
      catalog.holi_2027 = {
        enabled: Boolean(settings.festival_enabled),
        starts_at: asIso(settings.festival_starts_at),
        ends_at: asIso(settings.festival_ends_at),
        apply_website: true,
        apply_gym_manager: false,
      };
    }
  }
  return catalog;
}

export function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  const aS = aStart ? new Date(aStart).getTime() : NaN;
  const aE = aEnd ? new Date(aEnd).getTime() : NaN;
  const bS = bStart ? new Date(bStart).getTime() : NaN;
  const bE = bEnd ? new Date(bEnd).getTime() : NaN;
  if (![aS, aE, bS, bE].every(Number.isFinite)) return false;
  return aS < bE && bS < aE;
}

export function festivalWindowError(enabled, startsAt, endsAt) {
  if (!enabled) return null;
  if (!startsAt || !endsAt) {
    return "Set a start and an end in IST. The end must be after the start.";
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return "Set a start and an end in IST. The end must be after the start.";
  }
  return null;
}

export function overlappingFestivalError(catalog, theme, next) {
  if (!next.enabled) return null;
  for (const other of FESTIVAL_THEMES) {
    if (other === theme) continue;
    const cfg = catalog[other];
    if (!cfg?.enabled) continue;
    if (windowsOverlap(next.starts_at, next.ends_at, cfg.starts_at, cfg.ends_at)) {
      return "This schedule overlaps another festival theme. Change the dates or turn the other theme off.";
    }
  }
  return null;
}

export function themeIsInWindow(cfg, now = Date.now()) {
  if (!cfg?.enabled) return false;
  const start = cfg.starts_at ? new Date(cfg.starts_at).getTime() : NaN;
  const end = cfg.ends_at ? new Date(cfg.ends_at).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return now >= start && now < end;
}

export function resolveLiveFestivalTheme(catalog, surface, now = Date.now()) {
  const live = [];
  for (const theme of FESTIVAL_THEMES) {
    const cfg = catalog[theme];
    if (surface === "website" && !cfg.apply_website) continue;
    if (surface === "gym_manager" && !cfg.apply_gym_manager) continue;
    if (themeIsInWindow(cfg, now)) live.push(theme);
  }
  if (live.length === 1) return live[0];
  return null;
}

export function applyLegacyMirror(catalog) {
  const durgaOn = Boolean(catalog.durga_puja?.enabled);
  const diwaliOn = Boolean(catalog.diwali?.enabled);
  const chhathOn = Boolean(catalog.chhath_puja?.enabled);
  const nyOn = Boolean(catalog.new_year_2027?.enabled);
  const holiOn = Boolean(catalog.holi_2027?.enabled);
  const theme = durgaOn
    ? DURGA_PUJA_THEME
    : diwaliOn
      ? DIWALI_THEME
      : chhathOn
        ? CHHATH_PUJA_THEME
        : nyOn
          ? NEW_YEAR_2027_THEME
          : holiOn
            ? HOLI_2027_THEME
            : "";
  const src = theme ? catalog[theme] : null;
  return {
    festival_enabled: durgaOn || diwaliOn || chhathOn || nyOn || holiOn,
    festival_theme: theme,
    festival_starts_at: src?.starts_at || null,
    festival_ends_at: src?.ends_at || null,
  };
}
