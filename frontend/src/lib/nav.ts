import {
  CalendarDays,
  ClipboardList,
  Dumbbell,
  FileText,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Server,
  Settings,
  UserCog,
  Users,
  Wallet,
  Plane,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section?: string;
  tier?: "A" | "B" | "C";
  group: string;
  /** Opens in a new tab (external website CMS). */
  external?: boolean;
};

/** Production section order used by top tabs + sidebar. */
export const SECTION_ORDER = [
  "Dashboard",
  "Members",
  "PT Clients",
  "WhatsApp SMS",
  "Finance",
  "Staff",
  "Website",
  "Attendance",
  "Leave Tracker",
  "Settings",
  "Logs",
  "Support",
  "Backend",
] as const;

export type ProdSection = (typeof SECTION_ORDER)[number];

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Dashboard", tier: "A", group: "" },
  { href: "/members", label: "Members", icon: Users, section: "Members", tier: "A", group: "MEMBERS & CLIENTS" },
  { href: "/pt", label: "PT Clients", icon: Dumbbell, section: "PT Clients", tier: "A", group: "MEMBERS & CLIENTS" },
  { href: "/whatsapp", label: "WhatsApp SMS", icon: MessageSquare, section: "WhatsApp SMS", tier: "A", group: "COMMUNICATION" },
  { href: "/finance", label: "Finance", icon: Wallet, section: "Finance", tier: "A", group: "FINANCE" },
  { href: "/staff", label: "Staff", icon: UserCog, section: "Staff", tier: "A", group: "STAFF & MANAGEMENT" },
  {
    href: "https://www.actionplusgym.com/admin/login",
    label: "Website",
    icon: Globe,
    section: "Website",
    tier: "A",
    group: "STAFF & MANAGEMENT",
    external: true,
  },
  { href: "/attendance", label: "Attendance", icon: CalendarDays, section: "Attendance", tier: "A", group: "OPERATIONS" },
  { href: "/leave", label: "Leave Tracker", icon: Plane, section: "Leave Tracker", tier: "A", group: "OPERATIONS" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Settings", tier: "A", group: "SYSTEM" },
  { href: "/logs", label: "Logs", icon: ClipboardList, section: "Logs", tier: "A", group: "SYSTEM" },
  { href: "/support", label: "Support", icon: FileText, section: "Support", tier: "A", group: "SYSTEM" },
  { href: "/backend", label: "Backend", icon: Server, section: "Backend", tier: "A", group: "SYSTEM" },
];

export const NAV_GROUP_ORDER = [
  "",
  "MEMBERS & CLIENTS",
  "COMMUNICATION",
  "OPERATIONS",
  "FINANCE",
  "STAFF & MANAGEMENT",
  "SYSTEM",
] as const;

export const MOBILE_PRIMARY = [
  "/dashboard",
  "/members",
  "/pt",
  "/staff",
  "/leave",
];

export function sectionHref(section: string) {
  return NAV_ITEMS.find((i) => i.section === section)?.href || "/dashboard";
}
