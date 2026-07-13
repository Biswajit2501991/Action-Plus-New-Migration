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
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

export const WHATSAPP_TYPE_META: {
  key: WhatsAppTemplateKey | "templates";
  label: string;
  title: string;
  tone: string;
}[] = [
  {
    key: "reminder",
    label: "Reminder",
    title: "Billing Reminder SMS",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    key: "monthReminder",
    label: "Month Reminder",
    title: "Month-Based Reminder",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
  },
  {
    key: "success",
    label: "Success SMS",
    title: "Success SMS",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  {
    key: "fine",
    label: "Fine SMS",
    title: "Overdue / Fine SMS",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
  },
  {
    key: "deactivate",
    label: "Deactivate SMS",
    title: "Deactivate SMS",
    tone: "border-pink-200 bg-pink-50 text-pink-900",
  },
  {
    key: "hold",
    label: "Hold SMS",
    title: "Hold SMS",
    tone: "border-orange-200 bg-orange-50 text-orange-900",
  },
  {
    key: "welcome",
    label: "Welcome SMS",
    title: "Welcome SMS",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  {
    key: "templates",
    label: "Templates",
    title: "WhatsApp Templates",
    tone: "border-indigo-200 bg-indigo-50 text-indigo-900",
  },
];
