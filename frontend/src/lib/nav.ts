import {
  Activity,
  Boxes,
  ClipboardList,
  Dumbbell,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  Wallet,
  CalendarDays,
  MessageSquare,
  UserCog,
  Plane,
  Server,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section?: string;
  tier?: "A" | "B" | "C";
  group: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Dashboard", tier: "A", group: "Overview" },
  { href: "/members", label: "Members", icon: Users, section: "Members", tier: "A", group: "People" },
  { href: "/attendance", label: "Attendance", icon: CalendarDays, section: "Attendance", tier: "A", group: "People" },
  { href: "/leave", label: "Leave", icon: Plane, section: "Leave Tracker", tier: "A", group: "People" },
  { href: "/staff", label: "Staff", icon: UserCog, section: "Staff", tier: "A", group: "People" },
  { href: "/pt", label: "Personal Training", icon: Dumbbell, section: "PT Clients", tier: "A", group: "Training" },
  { href: "/finance", label: "Finance", icon: Wallet, section: "Finance", tier: "A", group: "Money" },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "Dashboard", tier: "B", group: "Money" },
  { href: "/whatsapp", label: "WhatsApp / SMS", icon: MessageSquare, section: "WhatsApp SMS", tier: "A", group: "Growth" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, tier: "C", group: "Growth" },
  { href: "/inventory", label: "Inventory", icon: Boxes, tier: "C", group: "Ops" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Settings", tier: "A", group: "Ops" },
  { href: "/logs", label: "Audit Logs", icon: ClipboardList, section: "Logs", tier: "A", group: "Ops" },
  { href: "/support", label: "Support", icon: FileText, section: "Support", tier: "A", group: "Ops" },
  { href: "/backend", label: "Backend", icon: Server, section: "Backend", tier: "A", group: "Ops" },
  { href: "/help", label: "Help", icon: HelpCircle, tier: "B", group: "Ops" },
];

export const MOBILE_PRIMARY = [
  "/dashboard",
  "/members",
  "/attendance",
  "/finance",
  "/more",
];
