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
      "On a phone, the header names the open section, such as Members or Finance, next to the staff role.",
      "Sign out at the bottom of the menu is the graphite button. It still ends this session the same way.",
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
      "When staff have already sent a reminder for this bill, Overdue Payments and Retention Alerts shows Reminder sent, with the time and staff name. The member stays on the list until the payment is recorded. The Reminder button works the same way.",
      "Today counts bill dates that are today, overdue members, renewals in the next 7 days, visitors who are not converted, and birthdays today. The chips only open lists. They do not change members, payments, or visitors.",
      "Hide names blurs the overdue, payment, expiring, and birthday lists until Show names is tapped. The tile counts stay visible. It does not save anything.",
      "Overdue shows five people first. See all shows the rest of the same list. Recent payments open that member.",
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
      "Add New Member blurs and locks the page behind it. The form still scrolls. Opening or closing it does not change a member record.",
      "On a phone, each member is a card with photo, name, status, bill date, Payment By, amount, mobile, and the same Reminder or Fine button. The wide table stays on a desktop.",
      "The row shows the plan amount and the mobile number. Tapping the number copies it. The member record stays the same.",
      "Needs reminder lists Active members whose bill is due and who have not been sent a reminder for this bill. The chip only changes which rows you see.",
      "Search and the status chips stay at the top while the list scrolls. A bill date that is today shows Due today on the row.",
      "All Members starts with Hold, Deactivated, and Cancelled collapsed. Show opens that list for this visit. Choosing that status chip opens it too. Member records stay the same.",
      "This browser remembers the last status chip. A link that already includes a status still opens that status. Choosing a chip does not change a member.",
      "Actions keeps Import CSV and Add Expense under Tools. Status changes sit in a separate box and still use the same buttons.",
      "Hold and Deactivated rows show the saved hold length, the note, and the hold message already on the record, next to how long they have been inactive.",
      "The row shows the date of the latest saved payment. It does not add or change a payment.",
      "When a payment is saved, that member gets a phone notification and a bell message with the saved amount and date. Editing or deleting a payment does not send it. The receipt stays in the Member Portal.",
      "Active Members, Hold Members, Risk Alert, and Win-back Opportunity filter as you type. Names that start with the letters come first. A column heading still sorts that list. Nothing is saved.",
      "Open a member to see plan, status, bill date, and portal details.",
      "T-shirt size, when the member has saved one, shows on the member record. The owner can tap Unlock T-shirt size to give that member two saves again. The saved size stays.",
      "Member Portal “Next Payment Date” for the member is the Bill Date on this record. The stored bill date is not rewritten by the portal label.",
    ],
  },
  {
    id: "membership-plans",
    title: "Membership Plans",
    gate: "Members",
    summary: "The plan cards for the branch you have open.",
    how: [
      "Each plan card shows how many Active members are on that plan name. Hold, deactivated, cancelled, and soft-deleted members stay out of the count. The plan save stays the same.",
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
      "Themes, Home tiles, and Broadcast at the top of Settings open that block. Each block keeps its own save button.",
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
      "A saved payment thanks that member with the amount and the date, and points them to the receipt. It does not send when a payment is edited or deleted. Gym-wide broadcast is unchanged.",
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
      "A thin line under the month shows the same collected, expenses, and profit already on this page. Category chips on the expense list only hide rows. The amounts and the expense save stay the same.",
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
      "Waiting for approval shows how many requests are still pending. Tapping it shows only those requests. Approve and Reject stay the same buttons.",
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    gate: "Attendance",
    summary: "Staff attendance and member QR check-in.",
    how: [
      "Member QR Check-in is the desk scan. It does not change a member’s plan or bill date.",
      "Not marked today counts staff with no status saved for today and scrolls to the first of those rows. It does not mark anyone present or absent.",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    gate: "WhatsApp SMS",
    summary: "WhatsApp SMS templates and Member Portal verification are separate menus.",
    how: [
      "WhatsApp Verification is how a member gets into the portal. A portal tile or a guide page does not change that login.",
      "Before send shows the example message and every name for that message type, including anyone with no mobile. The send button on each row stays the same.",
    ],
  },
  {
    id: "staff",
    title: "Staff",
    gate: "Staff",
    summary: "Staff logins, PIN, and which menus each person can open.",
    how: [
      "The staff login screen is a navy glass layout. The original logo sits at the top left with the gym name. The workout photo fills a large screen without cutting off the two athletes. Username, password, Remember me, Reset my password, and Forgot PIN still work the same way.",
      "If Alerts has a count, the header pill pulses for a few seconds the first time that staff opens the app that IST day. Opening Alerts or waiting stops it. Items are not marked read.",
      "Forgot PIN asks for the current password or the current PIN, then a new PIN. Security questions come up only if that does not match.",
      "Web view — sections & access is where a menu is turned on or off for a staff login.",
      "A new menu such as Read Me stays off for staff until it is checked there. The owner still sees it.",
      "Each staff row shows In today or On leave from today’s attendance and approved leave. It does not change attendance, leave, or the access editor.",
    ],
  },
  {
    id: "offers",
    title: "Offers",
    gate: "Offers",
    summary: "The shop desk for checking a member and saving a redemption.",
    how: [
      "Active shows redemptions saved today. Expired shows earlier rows in the list already on this page. The count is how many rows that view has. Verify member and Save redemption stay the same.",
    ],
  },
  {
    id: "logs",
    title: "Logs",
    gate: "Logs",
    summary: "A history of staff actions. New rows are added. Old rows are not rewritten by this guide.",
    how: [
      "A Bis Test push test adds one log line for that send. It does not change older log lines.",
      "Today sets the date range to today. This staff member sets the actor filter to the person signed in. Both use the filters already on this page.",
    ],
  },
];
