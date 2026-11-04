/**
 * In-app guide. Display only.
 * When a feature changes, update the matching topic in the same change.
 */

export type ReadmeTopic = {
  id: string;
  title: string;
  /** Hide this topic unless the reader can open that menu section. */
  gate?: string;
  summary: string;
  how: string[];
};

export const README_TOPICS: ReadmeTopic[] = [
  {
    id: "how-to-use",
    title: "How to use this page",
    summary:
      "Read Me is a guide to Gym Manager. Opening it does not change members, payments, WhatsApp, or logs.",
    how: [
      "Each block says what a part of the app does and how to use it.",
      "You see the blocks for menus you can already open. The owner sees the full guide.",
      "Staff see Read Me only after it is turned on under Staff → Web view — sections & access.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    gate: "Dashboard",
    summary:
      "The home counts for the gym: active, hold, deactivated, cancelled, and collected revenue.",
    how: [
      "Collected Revenue can sit under a gray cover until Show is tapped. The number underneath does not change.",
      "Tap Collected Revenue to see this month’s member payments and logged expenses. The box amount stays the same. Open Finance for the full expense section. Nothing is saved from that popup.",
      "Tile cover is on the Dashboard header and is for the master owner. It can also cover the revenue trend and recent payments. Member counts stay clear.",
      "Show lasts for this visit on this browser. Leaving or refreshing covers the number again.",
      "Branch staff see their own branch. Soft-deleted members stay out of the counts.",
      "The home page shows member tiles as soon as the list is ready. Revenue charts load next. Counts and collected revenue stay the same.",
    ],
  },
  {
    id: "members",
    title: "Members",
    gate: "Members",
    summary: "The member list, the member record, and the search at the top of this page.",
    how: [
      "Search matches name, member ID, mobile, email, and staff.",
      "New Visitor flashes on the Members row in the left menu for 24 hours after a visitor is added, including a website enquiry. Tap it to open Visitors. It does not change the visitor or member record.",
      "The visitor form goal list is Weight loss, Weight gain, Strength training, Just to stay fit, and Recovering from injury or medical condition. The posted QR link stays the same.",
      "Visitor intake QR is drawn in this browser from the public visit link. Copy link, Open form, and convert-to-member stay the same.",
      "Visitors shows 10 at a time. All, Converted, and Not converted only change which cards you see. They do not change visitor or member records.",
      "Open a member to see plan, status, bill date, and portal details.",
      "T-shirt size, when the member has saved one, shows on the member record. The owner can tap Unlock T-shirt size to give that member two saves again. The saved size stays.",
      "Member Portal “Next Payment Date” for the member is the Bill Date on this record. The stored bill date is not rewritten by the portal label.",
    ],
  },
  {
    id: "portal-tiles",
    title: "Member Portal home tiles",
    gate: "Settings",
    summary:
      "Settings → Home tiles decides which tiles a member sees in the portal. Turning a tile off hides it. It does not delete the member’s saved data.",
    how: [
      "T-shirt size: ON shows Update T-shirt size. OFF hides the tile. Sizes already saved stay, and Analytics → Members Data can still count them.",
      "A member can save a size twice (S, M, L, XL, XXL). The same size again does not use a save. After two different saves the choice locks until the owner unlocks it.",
      "Workout Plan OFF means you enable the plan member by member. ON means every member of a status is included.",
      "Workout Plan by status has a start and end date for Active, Hold, Deactivated, and Cancelled. Blank dates mean no limit. The dates are inclusive. A member’s own start and end still apply on top. PT stays hidden unless that member’s Workout Plan switch is on. Progress is kept when a window ends.",
      "The same tile switches exist on a branch portal override. A branch override applies only to that branch.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    gate: "Analytics",
    summary: "Charts for the gym, plus Members Data for combining member details.",
    how: [
      "Members Data filters by status, plan, branch, and T-shirt size, including Not set.",
      "The counts and the table read the member list. They do not change member rows.",
      "Soft-deleted members stay out. Branch staff see their own branch.",
      "Export CSV downloads the filtered list. The on-screen table shows the first 400 rows.",
    ],
  },
  {
    id: "settings-themes",
    title: "Settings — Themes",
    gate: "Settings",
    summary:
      "Festival looks for the public website and Gym Manager. The master owner sets Default, Durga Puja, Diwali, Chhath Puja, New Year 2027, or Holi 2027, with an IST start and end. Staff can see an active look but cannot change it.",
    how: [
      "Open Settings → Themes. Pick Default, Durga Puja, Diwali, Chhath Puja, New Year 2027, or Holi 2027.",
      "Enable, set Starts (IST) and Ends (IST), and choose Public Website, Gym Manager, or both.",
      "Preview shows the look on this Gym Manager device only when Apply to includes the app. Public website only never skins Gym Manager and does not refresh Settings or switch the picker to Default. Save stores the schedule. It turns on and off even if nobody is logged in.",
      "When Diwali, New Year 2027, or Holi 2027 is on for Gym Manager, colour rockets play in the background. They do not capture clicks. Payments, members, attendance, and reports stay the same.",
      "The Member Portal stays on the normal look.",
    ],
  },
  {
    id: "settings-push",
    title: "Settings — messages to members",
    gate: "Settings",
    summary:
      "Broadcast to members sends a phone notification and a bell message. Billing reminders are separate and are not changed by a broadcast.",
    how: [
      "Broadcast now goes to every active member who has notifications turned on. There is a 5-minute wait between gym-wide sends.",
      "Send test to Bis Test sends only to Bis Test (APG-1037/26-AP01). It shows in that member's portal bell and on the phone. Other members are not included, and it does not start the gym-wide wait.",
      "The bell opens a Notifications screen with every message. Tap a title to read it. That marks it read. Messages leave the inbox after 7 days.",
      "The red overdue card on the portal home is the Alerts tile, not the bell.",
      "If Broadcast cannot load recipients, the website cron secret may not match Gym Manager. That does not sign the owner out. Set the same MEMBER_PORTAL_CRON_SECRET (at least 16 characters) on both Railway services and in GitHub Actions.",
    ],
  },
  {
    id: "finance",
    title: "Finance",
    gate: "Finance",
    summary: "Collected money, expenses, and plan totals. These numbers are the source for money on the Dashboard.",
    how: [
      "Do not expect a display change on another page to rewrite payment history.",
      "Collected revenue on the Dashboard is the same money, sometimes covered until Show is tapped.",
      "The Expenses tile can show logged expenses, or a 26% estimate when none are logged. The owner switches this on the tile. It does not change payment or expense rows.",
    ],
  },
  {
    id: "leave",
    title: "Leave Tracker",
    gate: "Leave Tracker",
    summary: "Staff leave requests and the annual balance.",
    how: [
      "For one date, staff can choose Full day or Half day. A half day counts as 0.5 after it is approved.",
      "A range of dates stays a full-day leave. Leave already saved stays a full day.",
      "Approving a half day marks that attendance day as Half Day. It does not change pay.",
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    gate: "Attendance",
    summary: "Staff attendance and member QR check-in.",
    how: [
      "Member QR Check-in is the desk scan. It does not change a member’s plan or bill date.",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    gate: "WhatsApp SMS",
    summary: "WhatsApp SMS templates and Member Portal verification are separate menus.",
    how: [
      "WhatsApp Verification is how a member gets into the portal. A portal tile or a guide page does not change that login.",
    ],
  },
  {
    id: "staff",
    title: "Staff",
    gate: "Staff",
    summary: "Staff logins, PIN, and which menus each person can open.",
    how: [
      "The staff login screen is a navy glass layout. Username, password, Remember me, Reset my password, and Forgot PIN still work the same way.",
      "If Alerts has a count, the header pill pulses for a few seconds the first time that staff opens the app that IST day. Opening Alerts or waiting stops it. Items are not marked read.",
      "Forgot PIN asks for the current password or the current PIN, then a new PIN. Security questions come up only if that does not match.",
      "Web view — sections & access is where a menu is turned on or off for a staff login.",
      "A new menu such as Read Me stays off for staff until it is checked there. The owner still sees it.",
    ],
  },
  {
    id: "logs",
    title: "Logs",
    gate: "Logs",
    summary: "A history of staff actions. New rows are added. Old rows are not rewritten by this guide.",
    how: [
      "A Bis Test push test adds one log line for that send. It does not change older log lines.",
    ],
  },
];
