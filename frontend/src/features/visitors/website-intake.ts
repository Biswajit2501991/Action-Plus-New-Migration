/** Labels for visitors that came from the public website (not QR / walk-in). */

export function isWebsiteVisitor(intakeSource?: string | null): boolean {
  return String(intakeSource || "")
    .trim()
    .toLowerCase()
    .startsWith("website");
}

/** Short badge text, e.g. "Website customer". */
export function websiteVisitorBadge(intakeSource?: string | null): string | null {
  if (!isWebsiteVisitor(intakeSource)) return null;
  return "Website customer";
}

/** Longer detail line when the visitor row is opened. */
export function websiteVisitorDetail(intakeSource?: string | null): string | null {
  if (!isWebsiteVisitor(intakeSource)) return null;
  const source = String(intakeSource || "")
    .trim()
    .toLowerCase();
  if (source === "website_trial") return "Website submission · Free trial enquiry";
  if (source === "website_contact") return "Website submission · Contact form";
  if (source === "website_newsletter") return "Website submission · Newsletter";
  if (source === "website") return "Website submission · Join / membership enquiry";
  return "Website submission";
}
