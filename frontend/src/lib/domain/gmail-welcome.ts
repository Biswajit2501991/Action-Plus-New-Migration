import { isValidEmail } from "@/lib/domain/members";
import { nextPaymentDateFromBillingDate } from "@/lib/domain/member-dates";
import { formatDate } from "@/lib/utils";
import type { Member } from "@/types";

/** Production default (Support → Gmail Welcome Template). */
export const GMAIL_WELCOME_TEMPLATE_DEFAULT = `Hello, [CustomerName]

Warm greetings from Action Plus Gym!

We're thrilled to welcome you to the Action Plus Gym and Fitness Club family. Your membership has been successfully activated, and we're excited to be a part of your fitness journey.

Here are your membership details:
- Current Plan: [CurrentPlan]
- Gym Start Date: [GymStartdate]
- Next Payment Date: [NextPaymentDate]

Let's work together to help you achieve your health and fitness goals. We're here to support and motivate you every step of the way!

Stay strong. Stay consistent. Stay fit!

🏋️ Action Plus Gym – Member Policies
1. Membership is non-transferable and non-refundable. Violations may lead to suspension/termination.
2. No external/personal trainers allowed. Use Action Plus certified trainers only.
3. Wear proper attire, wipe equipment, return weights, and avoid loud behavior.
4. Report machine issues, carry towel/water, maintain hygiene.
5. Late payments may incur penalties. No refunds for missed days or mid-month exits.
6. Gym is for fitness only. No filming/photography without permission.
7. No guests without prior approval. You're responsible for your guest’s behavior.
8. Holds only for valid reasons with written request (max 1–2 months).
9. Misconduct leads to cancellation. Follow gym staff and trainer instructions.

Not sure about any of the policies? Feel free to ask—we’re here to help!

Best regards,
Team Action Plus Gym & Fitness Club
Email: gymactionplus@gmail.com
Website: www.actionplusgym.com
Phone: +91-7047157510`;

const GMAIL_CC = "gymactionplus@gmail.com";
const GMAIL_SUBJECT = "Action Plus Gym - Registration Confirmation Mail.";

function fmtMailDate(value?: string | null) {
  const formatted = formatDate(value);
  return formatted === "—" ? "" : formatted;
}

export function buildGmailWelcomeBody(
  member: Member,
  template?: string | null,
): string {
  const tpl = String(template || "").trim() || GMAIL_WELCOME_TEMPLATE_DEFAULT;
  const nextPay =
    member.nextPaymentDate || nextPaymentDateFromBillingDate(member.billingDate) || "";
  const rep: Record<string, string> = {
    "[CustomerName]": member.name || "",
    "[CurrentPlan]": member.plan || "",
    "[GymStartdate]": fmtMailDate(member.joiningDate),
    "[NextPaymentDate]": fmtMailDate(nextPay),
  };
  // Keep older saved templates aligned with current wording.
  let body = tpl.replace(/Next Payment Due:/g, "Next Payment Date:");
  for (const [key, value] of Object.entries(rep)) {
    body = body.split(key).join(value);
  }
  return body;
}

export function buildGmailWelcomeComposeUrl(
  member: Member,
  template?: string | null,
): { ok: true; url: string } | { ok: false; error: string } {
  const email = String(member.email || "").trim();
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "Member email is missing or invalid." };
  }
  const body = buildGmailWelcomeBody(member, template);
  const url =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(email)}` +
    `&cc=${encodeURIComponent(GMAIL_CC)}` +
    `&su=${encodeURIComponent(GMAIL_SUBJECT)}` +
    `&body=${encodeURIComponent(body)}`;
  return { ok: true, url };
}

export function safeOpenExternal(url: string): boolean {
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) {
      w.opener = null;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Opens Gmail compose for the welcome template (production parity). */
export function openGmailWelcome(
  member: Member,
  template?: string | null,
): { ok: true } | { ok: false; error: string } {
  const built = buildGmailWelcomeComposeUrl(member, template);
  if (!built.ok) return built;
  const opened = safeOpenExternal(built.url);
  if (!opened) {
    return {
      ok: false,
      error: "Could not open Gmail. Allow pop-ups for this site and try again.",
    };
  }
  return { ok: true };
}
