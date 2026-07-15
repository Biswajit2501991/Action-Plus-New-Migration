/** Production SMS / WhatsApp template defaults (branch API can override). */

export const SMS_TEMPLATE_DEFAULTS: Record<string, string> = {
  reminder: `🏋️ *Reminder: Payment Due* 🏋️

Hello *[CustomerName]!*

This is a friendly reminder that your next payment is due on *[BillingDate]* for INR *[Amount].*

📸 *Please share the payment screenshot once done for our reference.*

*Kindly clear your payment within one week of the billing date*.
The last date for payment is *[PaymentBy].*
After this, a fine of ₹100 will be added to your billing cycle.

At Action Plus Gym & Fitness Club, we are committed to making your fitness journey inspiring and rewarding.

For any queries, feel free to reach out to us.

Best regards,
Action Plus Gym & Fitness Club
📧 gymactionplus@gmail.com
🌐 www.actionplusgym.com
📞 +91-7047157510`,
  monthReminder: `Hi *[CustomerName]*, this is your month-based reminder for *[PLAN]*. Your billing month is *[BillingDate]*.`,
  fine: `🏋️ *NOTICE*: *Account Overdue*🏋️

Hello *[CustomerName]!*

We hope you're enjoying your workouts at Action Plus Gym & Fitness Club.

This is a reminder that your payment was due on *[PaymentBy].*

A fine of ₹100 has been added as payment was not received within one week of the due date.

Your current outstanding balance is now *₹[Amount] + ₹100 = ₹[Total Amount].*

*Important:*
If we do not receive an update within one week, your account will be deactivated.
Post deactivation, you will need to complete a full re-admission process to continue your workouts at Action Plus Gym.

For any queries, feel free to contact us:

📧 Email: gymactionplus@gmail.com
🌐 Website: www.actionplusgym.com
📞 Phone: +91-7047157510

Stay Fit, Stay Strong!
Action Plus Gym & Fitness Club`,
  deactivate: `🏋️ NOTICE: Account Deactivated 🏋️

Hey [CustomerName]!

We hope you're doing great!

Your membership at Action Plus Gym Adra has been deactivated — either upon your request or due to no response to recent reminders.

Good news!
If you wish to rejoin within 6 months, a readmission fee of ₹500 applies.
After 1 year, the rejoining process may differ, but we'll make it as seamless as possible for you.

Your fitness journey is important to us, and whenever you're ready, we'll be here to support you every step of the way! 💪

For any questions or assistance, feel free to reach out.

Thank you for making Action Plus Gym Adra your fitness home!

Best regards,
Action Plus Gym Adra
🌐 www.actionplusgym.com
📞 +91 7047157510
📧 gymactionplus@gmail.com`,
  hold: `🏋️ *NOTICE: Your Account is on HOLD* 🏋️

Hey *[CustomerName]!*

We wanted to confirm that your gym membership has been placed on HOLD as per your request on [HoldDate] for a period of [HoldMonth].

*Good to know:*
You can resume your membership anytime within the next 6 months without any additional readmission fees.
We're excited to help you pick up right where you left off whenever you're ready! 💪

Thank you for being a part of the Action Plus Gym Adra family. Let's stay focused on your fitness goals!

Best regards,
Action Plus Gym Adra
🌐 www.actionplusgym.com
📞 +91 7047157510
📧 gymactionplus@gmail.com`,
  birthday: `🎂 *Happy Birthday, [CustomerName]!* 🎉

Dear *[CustomerName]*,

On this special day — *[BirthdayDate]* — the entire *Action Plus Gym & Fitness Club* family sends you our warmest birthday wishes! 🥳

May your year ahead be filled with strength, joy, and milestones you're proud of. Keep showing up for yourself — every rep, every step, every choice counts. 💪✨

Your fitness family is cheering for you today and always. Come celebrate with us at the gym whenever you're ready!

With love and best wishes,
*Action Plus Gym & Fitness Club*
📧 gymactionplus@gmail.com
🌐 www.actionplusgym.com
📞 +91-7047157510`,
  welcome: `Hello, *[CustomerName]*! 🏋️

Greetings from Action Plus Gym!

We're delighted to inform you that your membership with Action Plus Gym & Fitness Club has been successfully activated. Below are your membership details for your reference."

Current Plan - *[CurrentPlan]*
Gym Starting date - *[GymStartdate]*
Next Payment Date - *[NextPaymentDate]*

*🏋️‍♂️ *Action Plus Gym – Member Policies*

1. Membership Policies
Membership is non-transferable and non-refundable.
Membership will be suspended or terminated for any rule violation.

2. Personal Training
External/personal trainers (online or offline) are strictly not allowed.
All personal training must be conducted by Action Plus certified trainers only.

3. Gym Etiquette
Wear appropriate gym attire and clean shoes.
Wipe down equipment after use.
Re-rack weights and return equipment to its place.
Loud or abusive behavior will not be tolerated.

4. Safety & Cleanliness
Report any malfunctioning machines to the staff immediately.
Maintain hygiene—carry a towel and water bottle.

5. Payment & Billing
Late payments may attract a penalty or result in temporary suspension.
Refunds are not provided for missed days or any day of month exits.

6. Facility Use
Gym equipment and space are for fitness purposes only.
No unauthorized filming or photography inside the gym without approval.

7. Guest & Visitors
No walk-in guests allowed without prior permission.
Members are responsible for the behavior of their guests (if allowed).

8. Hold & Freeze Policy
Membership can be put on hold only in special cases (medical/travel) with prior written request.
Maximum hold period: 1–2 months (approval-based).

9. Conduct & Compliance
Action Plus Gym reserves the right to cancel membership for misconduct.
Members must follow instructions from gym staff and trainers at all times.

Not sure about any of the policies?
Please feel free to ask—we're here to help!

Regards,
Action Plus Gym and Fitness Club
Adra
Email:- gymactionplus@gmail.com
WebSite: www.actionplusgym.com
Phone no:-+91- 7047157510`,
  success: `Hello [CustomerName]! 🏋️

Thank you for the recent payment that you have made.

For the amount of INR [Amount] on [TodaysDate].

Your next payment date would be on *[NextPaymentDate].*

*Mode of Payment* : *[PaymentMethod]*
*(System Details: [SystemDetails])*

Thank you for choosing Action Plus Gym & Fitness Club.

Best regards,
Action Plus Gym & Fitness Club
📧 gymactionplus@gmail.com
🌐 www.actionplusgym.com
📞 +91-7047157510`,
};

export const WHATSAPP_VARIABLE_KEYS = [
  "[CustomerName]",
  "[BirthdayDate]",
  "[PLAN]",
  "[CurrentPlan]",
  "[Amount]",
  "[BillingDate]",
  "[PaymentBy]",
  "[GymStartdate]",
  "[NextPaymentDate]",
  "[PaymentMethod]",
  "[SystemDetails]",
] as const;

export const WHATSAPP_TEMPLATE_KEYS = [
  "reminder",
  "monthReminder",
  "success",
  "fine",
  "deactivate",
  "hold",
  "welcome",
  "birthday",
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

export const WHATSAPP_TYPE_META: {
  key: WhatsAppTemplateKey | "templates";
  label: string;
  title: string;
  /** Card shell — light pastel accent, dark glass with tinted border. */
  tone: string;
  /** Thin accent bar / pill color for category identity. */
  accent: string;
  /** Soft glow / focus tint used on dark surfaces. */
  glow: string;
}[] = [
  {
    key: "reminder",
    label: "Reminder",
    title: "Billing Reminder SMS",
    tone: "border-amber-200/90 bg-gradient-to-br from-amber-50 to-white text-amber-950 dark:border-amber-500/20 dark:from-amber-950/40 dark:to-slate-950 dark:text-amber-50",
    accent: "bg-amber-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_12px_40px_-16px_rgba(245,158,11,0.35)]",
  },
  {
    key: "monthReminder",
    label: "Month Reminder",
    title: "Month-Based Reminder",
    tone: "border-sky-200/90 bg-gradient-to-br from-sky-50 to-white text-sky-950 dark:border-sky-500/20 dark:from-sky-950/40 dark:to-slate-950 dark:text-sky-50",
    accent: "bg-sky-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(14,165,233,0.12),0_12px_40px_-16px_rgba(14,165,233,0.35)]",
  },
  {
    key: "success",
    label: "Success SMS",
    title: "Success SMS",
    tone: "border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-950 dark:border-emerald-500/20 dark:from-emerald-950/35 dark:to-slate-950 dark:text-emerald-50",
    accent: "bg-emerald-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_12px_40px_-16px_rgba(16,185,129,0.35)]",
  },
  {
    key: "fine",
    label: "Fine SMS",
    title: "Overdue / Fine SMS",
    tone: "border-rose-200/90 bg-gradient-to-br from-rose-50 to-white text-rose-950 dark:border-rose-500/20 dark:from-rose-950/40 dark:to-slate-950 dark:text-rose-50",
    accent: "bg-rose-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(244,63,94,0.12),0_12px_40px_-16px_rgba(244,63,94,0.35)]",
  },
  {
    key: "deactivate",
    label: "Deactivate SMS",
    title: "Deactivate SMS",
    tone: "border-fuchsia-200/90 bg-gradient-to-br from-fuchsia-50 to-white text-fuchsia-950 dark:border-fuchsia-500/20 dark:from-fuchsia-950/35 dark:to-slate-950 dark:text-fuchsia-50",
    accent: "bg-fuchsia-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(217,70,239,0.12),0_12px_40px_-16px_rgba(217,70,239,0.3)]",
  },
  {
    key: "hold",
    label: "Hold SMS",
    title: "Hold SMS",
    tone: "border-orange-200/90 bg-gradient-to-br from-orange-50 to-white text-orange-950 dark:border-orange-500/20 dark:from-orange-950/35 dark:to-slate-950 dark:text-orange-50",
    accent: "bg-orange-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(249,115,22,0.12),0_12px_40px_-16px_rgba(249,115,22,0.3)]",
  },
  {
    key: "welcome",
    label: "Welcome SMS",
    title: "Welcome SMS",
    tone: "border-teal-200/90 bg-gradient-to-br from-teal-50 to-white text-teal-950 dark:border-teal-500/20 dark:from-teal-950/35 dark:to-slate-950 dark:text-teal-50",
    accent: "bg-teal-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(20,184,166,0.12),0_12px_40px_-16px_rgba(20,184,166,0.3)]",
  },
  {
    key: "birthday",
    label: "Birthday SMS",
    title: "Birthday Wish SMS",
    tone: "border-pink-200/90 bg-gradient-to-br from-pink-50 via-rose-50 to-white text-rose-950 dark:border-pink-500/20 dark:from-pink-950/35 dark:via-rose-950/25 dark:to-slate-950 dark:text-pink-50",
    accent: "bg-gradient-to-r from-pink-500 to-rose-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(236,72,153,0.12),0_12px_40px_-16px_rgba(236,72,153,0.35)]",
  },
  {
    key: "templates",
    label: "WhatsApp Template",
    title: "WhatsApp Templates",
    tone: "border-violet-200/90 bg-gradient-to-br from-violet-50 to-white text-violet-950 dark:border-violet-500/20 dark:from-violet-950/35 dark:to-slate-950 dark:text-violet-50",
    accent: "bg-violet-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_12px_40px_-16px_rgba(139,92,246,0.3)]",
  },
];
