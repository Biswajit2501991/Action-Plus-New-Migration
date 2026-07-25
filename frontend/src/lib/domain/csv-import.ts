import type { Member } from "@/types";
import { normalizePhone } from "@/lib/domain/members";
import {
  nextPaymentDateFromBillingDate,
  paymentByFromBillingDate,
  isoDate,
} from "@/lib/domain/member-dates";

const CSV_HEADER_ALIASES: Record<string, string[]> = {
  formNo: ["formnumber", "formno"],
  memberId: ["id", "memberid"],
  name: ["name", "fullname", "customername"],
  gender: ["gender", "sex"],
  dob: ["dateofbirth", "dob", "birthdate"],
  email: ["gmailid", "email", "gmail"],
  phone: ["mobileno", "mobile", "phoneno", "phone"],
  plan: ["membershipplans", "membershipplan", "plan"],
  amount: ["monthlyamount", "amount"],
  status: ["status"],
  holdDuration: ["holdformonths", "holdduration"],
  joiningDate: ["dateofjoining", "joiningdate"],
  billingDate: ["paymentdate", "billingdate"],
};

function normalizeCsvHeader(v: string) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readCsvCells(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvText(text: string) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = readCsvCells(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = readCsvCells(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function extractCsvField(row: Record<string, string>, key: string) {
  const aliases = CSV_HEADER_ALIASES[key] || [];
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const match = entries.find(([k]) => normalizeCsvHeader(k) === alias);
    if (match) return String(match[1] ?? "").trim();
  }
  return "";
}

function parseFlexibleDateToIso(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^(nil|na|n\/a|-|null|undefined)$/i.test(value)) return "";
  const monthMap: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return isoDate(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
    );
  }
  m = value.match(/^(\d{1,2})[/-]([A-Za-z]{3,})[/-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const mon = monthMap[String(m[2]).slice(0, 3).toLowerCase()];
    const yearRaw = Number(m[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (Number.isFinite(mon)) return isoDate(new Date(Date.UTC(year, mon, day)));
  }
  m = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const mon = Number(m[2]) - 1;
    const yearRaw = Number(m[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return isoDate(new Date(Date.UTC(year, mon, day)));
  }
  return isoDate(value);
}

function payMonthLabel(billingDate: string) {
  const key = isoDate(billingDate);
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + 1, 1));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[next.getUTCMonth()]}-${next.getUTCFullYear()}`;
}

export type CsvImportPreparedRow = {
  rowNo: number;
  action: "add" | "update" | "skip";
  reason: string;
  member: Partial<Member> | null;
  matchMemberId?: string;
};

export function prepareCsvImportRows(
  text: string,
  existingMembers: Member[],
  opts: {
    plans?: string[];
    paymentMethods?: string[];
    staffName?: string;
  } = {},
): { rows: CsvImportPreparedRow[]; summary: { added: number; updated: number; skipped: number }; fileError?: string } {
  const parsed = parseCsvText(text);
  if (!parsed.rows.length) {
    return {
      rows: [],
      summary: { added: 0, updated: 0, skipped: 0 },
      fileError: "CSV is empty or invalid.",
    };
  }

  const seen = new Set<string>();
  const preparedRows: CsvImportPreparedRow[] = parsed.rows.map((raw, idx) => {
    const name = extractCsvField(raw, "name");
    const mobileRaw = extractCsvField(raw, "phone");
    const mobile = normalizePhone(mobileRaw);
    if (!name || !mobile) {
      return {
        rowNo: idx + 2,
        action: "skip",
        reason: "Missing required Name or Mobile",
        member: null,
      };
    }
    const rawMemberId = extractCsvField(raw, "memberId");
    const rawFormNo = extractCsvField(raw, "formNo");
    const numericFormNo = Number(String(rawFormNo || "").replace(/\D/g, ""));
    const defaultFormNo =
      Number.isFinite(numericFormNo) && numericFormNo > 0
        ? numericFormNo
        : existingMembers.length + idx + 1;
    const yearSuffix = String(new Date().getFullYear()).slice(-2);
    const memberId =
      rawMemberId || `APG-${String(defaultFormNo).padStart(3, "0")}/${yearSuffix}`;
    const joiningDate = parseFlexibleDateToIso(extractCsvField(raw, "joiningDate")) || isoDate(new Date());
    const billingDate = parseFlexibleDateToIso(extractCsvField(raw, "billingDate")) || joiningDate;
    const amount =
      Number(String(extractCsvField(raw, "amount") || "0").replace(/[^0-9.-]/g, "")) || 0;
    const incomingStatus = String(extractCsvField(raw, "status") || "")
      .trim()
      .toLowerCase();
    const statusMap: Record<string, string> = {
      active: "Active",
      hold: "Hold",
      deactivated: "Deactivated",
      cancelled: "Cancelled",
    };
    const status = statusMap[incomingStatus] || "Active";
    const holdRaw = extractCsvField(raw, "holdDuration");
    const holdDuration = /month/i.test(holdRaw) ? holdRaw : "";
    const member: Partial<Member> = {
      formNo: defaultFormNo,
      memberId,
      name,
      gender: extractCsvField(raw, "gender") || "",
      dob: parseFlexibleDateToIso(extractCsvField(raw, "dob")) || "",
      email: extractCsvField(raw, "email") || "",
      mobile,
      staff: opts.staffName || "",
      amount,
      plan: extractCsvField(raw, "plan") || opts.plans?.[0] || "Basic Plan",
      joiningDate,
      billingDate,
      nextPaymentDate: nextPaymentDateFromBillingDate(billingDate),
      paymentBy: paymentByFromBillingDate(billingDate),
      status,
      holdDuration: status === "Hold" ? holdDuration : "",
      paymentMethod: opts.paymentMethods?.[0] || "Cash",
      remark: "Imported via CSV",
      photo: "",
      attachments: [],
      payMonth: payMonthLabel(billingDate),
      updatedBy: opts.staffName || "",
    };

    const key = String(member.memberId || "").trim() || normalizePhone(member.mobile);
    if (seen.has(key)) {
      return { rowNo: idx + 2, action: "skip", reason: "Duplicate row key in CSV", member };
    }
    seen.add(key);

    const existing =
      existingMembers.find(
        (m) => String(m.memberId || "").trim() === String(member.memberId || "").trim(),
      ) ||
      existingMembers.find((m) => normalizePhone(m.mobile) === normalizePhone(member.mobile));
    return {
      rowNo: idx + 2,
      action: existing ? "update" : "add",
      reason: "",
      member,
      matchMemberId: existing?.memberId || "",
    };
  });

  const summary = preparedRows.reduce(
    (acc, r) => {
      if (r.action === "add") acc.added += 1;
      else if (r.action === "update") acc.updated += 1;
      else acc.skipped += 1;
      return acc;
    },
    { added: 0, updated: 0, skipped: 0 },
  );

  return { rows: preparedRows, summary };
}

/** Merge prepared CSV rows into the current member list (in-memory). */
export function mergeCsvImportIntoMembers(
  existing: Member[],
  preparedRows: CsvImportPreparedRow[],
): Member[] {
  const next = [...existing];
  const importTs = new Date().toISOString();
  for (const r of preparedRows) {
    if ((r.action !== "add" && r.action !== "update") || !r.member) continue;
    const incoming = r.member as Member;
    const idx = next.findIndex(
      (m) =>
        String(m.memberId || "").trim() === String(incoming.memberId || "").trim() ||
        normalizePhone(m.mobile) === normalizePhone(incoming.mobile),
    );
    if (idx >= 0) {
      const prevRow = next[idx];
      next[idx] = {
        ...prevRow,
        ...incoming,
        attachments: prevRow.attachments || [],
        photo: prevRow.photo || incoming.photo || "",
        updatedAt: importTs,
      };
    } else {
      next.unshift({
        ...incoming,
        updatedAt: importTs,
        createdAt: incoming.createdAt || importTs,
      } as Member);
    }
  }
  return next;
}
