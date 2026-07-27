import { Access } from "../auth/accessControl.js";
import {
  authHasGlobalBranchRead,
  resolveActiveBranchId,
  resolveReadBranchIds,
} from "../auth/tenant/scopedAuth.js";
import { requireAccess } from "../middleware/permissions.js";

/**
 * Read-only System Analytics aggregates.
 * Never writes members, payments, portal, or audit tables.
 */
export function registerAnalyticsRoutes(app) {
  const analyticsRead = (a) =>
    Access.membersRead(a) ||
    Access.financeRead(a) ||
    a.logs?.viewLogs === true ||
    a.dashboard?.viewDashboardCore !== false ||
    a.dashboard?.viewMembershipTrends !== false;

  function todayKeyLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function daysAgoIso(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  function monthKeyFromDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  /** Last N calendar month keys ending at `through` (YYYY-MM), inclusive. */
  function lastNMonthKeys(through = monthKeyFromDate(), n = 12) {
    const parts = String(through || "").split("-").map(Number);
    let y = parts[0];
    let m = parts[1];
    if (!y || !m) return [];
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }

  /** Owner with no active branch = gym-wide; otherwise restrict to allowed gym code ids. */
  function branchIdsForAuth(auth) {
    if (authHasGlobalBranchRead(auth) && !resolveActiveBranchId(auth)) {
      return null;
    }
    const allowed = resolveReadBranchIds(auth);
    if (!allowed?.length) return [];
    return allowed;
  }

  function applyBranchEq(q, column, branchIds) {
    if (branchIds == null) return q;
    if (!branchIds.length) return q.eq(column, "__no_branch__");
    return branchIds.length === 1 ? q.eq(column, branchIds[0]) : q.in(column, branchIds);
  }

  async function loadBranchMemberKeys(sb, gid, branchIds) {
    if (branchIds == null) return null;
    if (!branchIds.length) {
      return { codes: new Set(), uuids: new Set(), pks: new Set() };
    }
    let q = sb
      .from("members")
      .select("id, member_code, member_uuid")
      .eq("gym_id", gid)
      .is("deleted_at", null);
    q = applyBranchEq(q, "assigned_gym_code_id", branchIds);
    const { data } = await q.limit(8000);
    const codes = new Set();
    const uuids = new Set();
    const pks = new Set();
    for (const row of data || []) {
      if (row.member_code) codes.add(String(row.member_code));
      if (row.member_uuid) uuids.add(String(row.member_uuid));
      if (row.id != null) pks.add(row.id);
    }
    return { codes, uuids, pks };
  }

  function filterBySet(rows, key, set) {
    if (!set) return rows || [];
    return (rows || []).filter((r) => set.has(String(r[key] || "")));
  }

  app.get("/api/analytics/overview", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const today = todayKeyLocal();
      const since7 = daysAgoIso(7);
      const month = monthKeyFromDate();
      const memberKeys = await loadBranchMemberKeys(sb, gid, branchIds);

      let membersQ = sb
        .from("members")
        .select("status, portal_enabled, portal_status, payment_by, amount, deleted_at, assigned_gym_code_id")
        .eq("gym_id", gid)
        .is("deleted_at", null);
      membersQ = applyBranchEq(membersQ, "assigned_gym_code_id", branchIds);

      let visitorsQ = sb
        .from("visitors")
        .select("id, created_at, intake_source, status, assigned_gym_code_id")
        .eq("gym_id", gid)
        .gte("created_at", since7);
      visitorsQ = applyBranchEq(visitorsQ, "assigned_gym_code_id", branchIds);

      const [membersRes, paymentsRes, portalLoginRes, visitorsRes, attendanceRes] = await Promise.all([
        membersQ.limit(5000),
        sb
          .from("member_payment_history")
          .select("amount, paid_at, member_id")
          .eq("gym_id", gid)
          .gte("paid_at", `${month}-01`)
          .limit(5000),
        sb
          .from("member_portal_audit_logs")
          .select("id, event_type, created_at, member_uuid")
          .eq("gym_id", gid)
          .in("event_type", ["login", "webauthn_login", "pin_login"])
          .gte("created_at", since7)
          .limit(5000),
        visitorsQ.limit(2000),
        sb
          .from("staff_attendance_records")
          .select("id, status, attendance_date")
          .eq("gym_id", gid)
          .eq("attendance_date", today)
          .limit(500),
      ]);

      const members = membersRes.data || [];
      const byStatus = { Active: 0, Hold: 0, Deactivated: 0, Cancelled: 0 };
      let overdue = 0;
      let portalEnabled = 0;
      const todayMs = Date.now();
      for (const m of members) {
        const st = String(m.status || "").trim();
        if (st in byStatus) byStatus[st] += 1;
        if (m.portal_enabled !== false && m.portal_status !== "disabled") portalEnabled += 1;
        const pb = m.payment_by ? Date.parse(String(m.payment_by).slice(0, 10)) : NaN;
        if (Number.isFinite(pb) && pb < todayMs - 86400000 && st === "Active") overdue += 1;
      }

      let payments = paymentsRes.data || [];
      if (memberKeys?.pks) {
        payments = payments.filter((p) => memberKeys.pks.has(p.member_id));
      }
      const collectedMtd = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

      let portalLogins = portalLoginRes.data || [];
      if (memberKeys?.uuids) {
        portalLogins = filterBySet(portalLogins, "member_uuid", memberKeys.uuids);
      }

      const attendance = attendanceRes.data || [];
      const staffPresent = attendance.filter((r) =>
        /present|in|late/i.test(String(r.status || "")),
      ).length;

      return res.json({
        ok: true,
        asOf: new Date().toISOString(),
        branchScoped: branchIds != null,
        kpis: {
          activeMembers: byStatus.Active,
          holdMembers: byStatus.Hold,
          deactivatedMembers: byStatus.Deactivated,
          cancelledMembers: byStatus.Cancelled,
          collectedMtd,
          overdueActive: overdue,
          portalLogins7d: portalLogins.length,
          portalEnabled,
          websiteLeads7d: (visitorsRes.data || []).length,
          staffPresentToday: staffPresent,
          staffAttendanceRowsToday: attendance.length,
        },
        statusMix: byStatus,
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-overview-failed" });
    }
  });

  /** Members aggregates — SELECT only; soft-deleted excluded. */
  app.get("/api/analytics/members", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      let q = sb
        .from("members")
        .select(
          "member_code, full_name, status, plan_name, joining_date, payment_by, amount, dob, deleted_at, assigned_gym_code_id",
        )
        .eq("gym_id", gid)
        .is("deleted_at", null);
      q = applyBranchEq(q, "assigned_gym_code_id", branchIds);
      const { data, error } = await q.limit(5000);
      if (error) return res.status(500).json({ error: error.message });

      const members = data || [];
      const byStatus = { Active: 0, Hold: 0, Deactivated: 0, Cancelled: 0 };
      const byPlan = {};
      const joinsByMonth = {};
      const allowedJoinMonths = new Set(lastNMonthKeys(monthKeyFromDate(), 12));
      for (const m of members) {
        const st = String(m.status || "").trim();
        if (st in byStatus) byStatus[st] += 1;
        // Plan mix top-10 is Active-only (display aggregate; does not mutate members).
        if (st === "Active") {
          const plan = String(m.plan_name || "Unknown").trim() || "Unknown";
          byPlan[plan] = (byPlan[plan] || 0) + 1;
        }
        // Display-only window: ignore future / typo joining_date months (e.g. 2044-07).
        const jm = String(m.joining_date || "").slice(0, 7);
        if (allowedJoinMonths.has(jm)) joinsByMonth[jm] = (joinsByMonth[jm] || 0) + 1;
      }

      return res.json({
        ok: true,
        branchScoped: branchIds != null,
        total: members.length,
        statusMix: byStatus,
        planMix: Object.entries(byPlan)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([plan, count]) => ({ plan, count })),
        joinsByMonth: [...allowedJoinMonths]
          .sort((a, b) => a.localeCompare(b))
          .map((month) => ({ month, count: joinsByMonth[month] || 0 })),
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-members-failed" });
    }
  });

  /** Money snapshot — cash = member_payment_history (same as Finance). */
  app.get("/api/analytics/money", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const memberKeys = await loadBranchMemberKeys(sb, gid, branchIds);
      const month = monthKeyFromDate();
      const yearStart = `${month.slice(0, 4)}-01-01`;

      const { data: payments, error } = await sb
        .from("member_payment_history")
        .select("amount, paid_at, method, member_id")
        .eq("gym_id", gid)
        .gte("paid_at", yearStart)
        .limit(8000);
      if (error) return res.status(500).json({ error: error.message });

      let rows = payments || [];
      if (memberKeys?.pks) {
        rows = rows.filter((p) => memberKeys.pks.has(p.member_id));
      }

      const byMonth = {};
      const byMethod = {};
      let collectedMtd = 0;
      let collectedYtd = 0;
      for (const row of rows) {
        const amt = Number(row.amount) || 0;
        const mk = String(row.paid_at || "").slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(mk)) {
          byMonth[mk] = (byMonth[mk] || 0) + amt;
          collectedYtd += amt;
          if (mk === month) collectedMtd += amt;
        }
        const method = String(row.method || "unknown").trim() || "unknown";
        byMethod[method] = (byMethod[method] || 0) + amt;
      }

      return res.json({
        ok: true,
        branchScoped: branchIds != null,
        monthKey: month,
        collectedMtd,
        collectedYtd,
        methodMix: Object.entries(byMethod)
          .sort((a, b) => b[1] - a[1])
          .map(([method, amount]) => ({ method, amount })),
        trend: Object.entries(byMonth)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([monthKey, revenue]) => ({ monthKey, revenue })),
        note: "Cash collected from member_payment_history — matches Finance collected semantics.",
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-money-failed" });
    }
  });

  app.get("/api/analytics/portal", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const memberKeys = await loadBranchMemberKeys(sb, gid, branchIds);
      const since30 = daysAgoIso(30);
      const since7 = daysAgoIso(7);

      let membersQ = sb
        .from("members")
        .select(
          "portal_enabled, portal_status, portal_activated_at, last_portal_login_at, deleted_at, assigned_gym_code_id, member_uuid",
        )
        .eq("gym_id", gid)
        .is("deleted_at", null);
      membersQ = applyBranchEq(membersQ, "assigned_gym_code_id", branchIds);

      const [membersRes, events30Res, devicesRes] = await Promise.all([
        membersQ.limit(5000),
        sb
          .from("member_portal_audit_logs")
          .select("event_type, created_at, member_uuid")
          .eq("gym_id", gid)
          .gte("created_at", since30)
          .order("created_at", { ascending: false })
          .limit(8000),
        sb.from("member_portal_devices").select("id, last_seen_at, member_uuid").eq("gym_id", gid).limit(3000),
      ]);

      const members = membersRes.data || [];
      const total = members.length || 1;
      let enabled = 0;
      let activated = 0;
      let loggedIn30 = 0;
      const cutoff30 = Date.parse(since30);
      for (const m of members) {
        if (m.portal_enabled !== false && m.portal_status !== "disabled") enabled += 1;
        if (m.portal_activated_at) activated += 1;
        const last = m.last_portal_login_at ? Date.parse(m.last_portal_login_at) : NaN;
        if (Number.isFinite(last) && last >= cutoff30) loggedIn30 += 1;
      }

      let events = events30Res.data || [];
      if (memberKeys?.uuids) {
        events = filterBySet(events, "member_uuid", memberKeys.uuids);
      }

      const byType = {};
      const loginMembers7 = new Set();
      const loginMembers30 = new Set();
      const cutoff7 = Date.parse(since7);
      for (const e of events) {
        const t = String(e.event_type || "unknown");
        byType[t] = (byType[t] || 0) + 1;
        if (/login/i.test(t) && e.member_uuid) {
          loginMembers30.add(e.member_uuid);
          if (Date.parse(e.created_at) >= cutoff7) loginMembers7.add(e.member_uuid);
        }
      }

      const featureKeys = [
        "payments_viewed",
        "attendance_viewed",
        "profile_viewed",
        "chat_opened",
        "training_viewed",
        "weight_viewed",
        "bookings_viewed",
      ];
      const featureUsage = featureKeys.map((key) => ({
        event: key,
        count: byType[key] || 0,
      }));

      const topEvents = Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([event, count]) => ({ event, count }));

      let devices = devicesRes.data || [];
      if (memberKeys?.uuids) {
        devices = filterBySet(devices, "member_uuid", memberKeys.uuids);
      }

      return res.json({
        ok: true,
        sparse: events.length < 5,
        branchScoped: branchIds != null,
        summary: {
          membersTotal: members.length,
          portalEnabled: enabled,
          portalActivated: activated,
          activationPct: Math.round((activated / total) * 1000) / 10,
          enabledPct: Math.round((enabled / total) * 1000) / 10,
          dauApprox7d: loginMembers7.size,
          mauApprox30d: loginMembers30.size,
          loggedInLast30d: loggedIn30,
          devices: devices.length,
        },
        featureUsage,
        topEvents,
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-portal-failed" });
    }
  });

  app.get("/api/analytics/operations", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const memberKeys = await loadBranchMemberKeys(sb, gid, branchIds);
      const since30 = daysAgoIso(30);
      const today = todayKeyLocal();

      const [staffAtt, memberAtt, leaveRes, auditRes] = await Promise.all([
        sb
          .from("staff_attendance_records")
          .select("status, attendance_date, staff_login_id")
          .eq("gym_id", gid)
          .gte("attendance_date", since30.slice(0, 10))
          .limit(5000),
        sb
          .from("member_attendance_records")
          .select("id, checked_in_at, member_uuid")
          .eq("gym_id", gid)
          .gte("checked_in_at", since30)
          .limit(2000),
        sb
          .from("leave_requests")
          .select("id, status, created_at, staff_login_id")
          .eq("gym_id", gid)
          .gte("created_at", since30)
          .limit(1000),
        sb
          .from("audit_logs")
          .select("action, logged_at, actor_id, branch_id")
          .eq("gym_id", gid)
          .gte("logged_at", since30)
          .limit(5000),
      ]);

      const staffRows = staffAtt.data || [];
      const presentish = staffRows.filter((r) => /present|in|late/i.test(String(r.status || ""))).length;

      let audits = auditRes.data || [];
      if (branchIds != null) {
        const set = new Set(branchIds);
        audits = audits.filter((row) => {
          const bid = String(row.branch_id || "").trim();
          return !bid || set.has(bid);
        });
      }

      const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
      for (const row of audits) {
        const h = new Date(row.logged_at).getHours();
        if (Number.isFinite(h)) byHour[h].count += 1;
      }
      const actionMix = {};
      for (const row of audits) {
        const a = String(row.action || "unknown");
        actionMix[a] = (actionMix[a] || 0) + 1;
      }

      let memberCheckins = memberAtt.data || [];
      if (memberKeys?.uuids) {
        memberCheckins = filterBySet(memberCheckins, "member_uuid", memberKeys.uuids);
      }
      const leave = leaveRes.data || [];

      return res.json({
        ok: true,
        branchScoped: branchIds != null,
        staff: {
          rows30d: staffRows.length,
          presentish30d: presentish,
          presentPct: staffRows.length
            ? Math.round((presentish / staffRows.length) * 1000) / 10
            : 0,
          todayKey: today,
        },
        memberCheckins: {
          count30d: memberCheckins.length,
          sparse: memberCheckins.length < 5,
          uniqueMembers30d: new Set(memberCheckins.map((r) => r.member_uuid).filter(Boolean)).size,
        },
        leave: {
          requests30d: leave.length,
          approved: leave.filter((r) => /approv/i.test(String(r.status || ""))).length,
          pending: leave.filter((r) => /pend/i.test(String(r.status || ""))).length,
        },
        staffActions: {
          total30d: audits.length,
          byHour,
          topActions: Object.entries(actionMix)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([action, count]) => ({ action, count })),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-operations-failed" });
    }
  });

  app.get("/api/analytics/pt", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const memberKeys = await loadBranchMemberKeys(sb, gid, branchIds);
      const since30 = daysAgoIso(30).slice(0, 10);

      let membersQ = sb
        .from("members")
        .select("id, plan_name, status, deleted_at, assigned_gym_code_id")
        .eq("gym_id", gid)
        .is("deleted_at", null);
      membersQ = applyBranchEq(membersQ, "assigned_gym_code_id", branchIds);

      const [profilesRes, workoutsRes, measurementsRes, membersRes] = await Promise.all([
        sb
          .from("pt_client_profiles")
          .select("member_id, trainer_staff_code, plan_json, updated_at")
          .eq("gym_id", gid)
          .limit(500),
        sb
          .from("member_daily_workouts")
          .select("workout_date, member_uuid, exercises")
          .eq("gym_id", gid)
          .gte("workout_date", since30)
          .limit(3000),
        sb
          .from("member_measurements")
          .select("id, measured_at, weight_kg, member_uuid")
          .eq("gym_id", gid)
          .limit(2000),
        membersQ.limit(5000),
      ]);

      let profiles = profilesRes.data || [];
      if (memberKeys?.pks) {
        profiles = profiles.filter((p) => memberKeys.pks.has(p.member_id));
      }

      const byTrainer = {};
      let focusDays = 0;
      for (const p of profiles) {
        const t = String(p.trainer_staff_code || "unassigned").trim() || "unassigned";
        byTrainer[t] = (byTrainer[t] || 0) + 1;
        const focus = p.plan_json?.focusByDate;
        if (focus && typeof focus === "object") focusDays += Object.keys(focus).length;
      }

      const ptPlanMembers = (membersRes.data || []).filter((m) =>
        /\bpt\b/i.test(String(m.plan_name || "")),
      ).length;

      let workouts = workoutsRes.data || [];
      if (memberKeys?.uuids) {
        workouts = filterBySet(workouts, "member_uuid", memberKeys.uuids);
      }
      const withExercises = workouts.filter(
        (w) => Array.isArray(w.exercises) && w.exercises.length > 0,
      ).length;

      let measurements = measurementsRes.data || [];
      if (memberKeys?.uuids) {
        measurements = filterBySet(measurements, "member_uuid", memberKeys.uuids);
      }

      return res.json({
        ok: true,
        sparse: profiles.length < 1,
        branchScoped: branchIds != null,
        summary: {
          ptProfiles: profiles.length,
          ptPlanMembers,
          scheduledFocusDays: focusDays,
          workoutLogs30d: workouts.length,
          workoutLogsWithExercises30d: withExercises,
          measurements: measurements.length,
        },
        trainerLoad: Object.entries(byTrainer)
          .sort((a, b) => b[1] - a[1])
          .map(([trainer, count]) => ({ trainer, count })),
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-pt-failed" });
    }
  });

  app.get("/api/analytics/website", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const since30 = daysAgoIso(30);

      let visitorsQ = sb
        .from("visitors")
        .select("id, status, intake_source, created_at, call_back_required, assigned_gym_code_id")
        .eq("gym_id", gid)
        .gte("created_at", since30);
      visitorsQ = applyBranchEq(visitorsQ, "assigned_gym_code_id", branchIds);

      const [visitorsRes, threadsRes] = await Promise.all([
        visitorsQ.limit(3000),
        sb
          .from("website_bot_threads")
          .select("id, created_at, updated_at, status")
          .eq("gym_id", gid)
          .gte("created_at", since30)
          .limit(2000),
      ]);

      const visitors = visitorsRes.data || [];
      const byStatus = {};
      const bySource = {};
      for (const v of visitors) {
        const st = String(v.status || "New");
        const src = String(v.intake_source || "unknown");
        byStatus[st] = (byStatus[st] || 0) + 1;
        bySource[src] = (bySource[src] || 0) + 1;
      }

      const threads = threadsRes.error ? [] : threadsRes.data || [];

      return res.json({
        ok: true,
        sparse: visitors.length < 3,
        branchScoped: branchIds != null,
        summary: {
          leads30d: visitors.length,
          callbackRequired: visitors.filter((v) => v.call_back_required).length,
          botThreads30d: threads.length,
        },
        funnel: Object.entries(byStatus)
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => ({ status, count })),
        sources: Object.entries(bySource)
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => ({ source, count })),
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-website-failed" });
    }
  });

  /** Phase 3: read-only lead↔member mobile match + check-in footfall. Never writes. */
  app.get("/api/analytics/growth", requireAccess(analyticsRead), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const branchIds = branchIdsForAuth(req.auth);
      const since90 = daysAgoIso(90);

      let visitorsQ = sb
        .from("visitors")
        .select("id, full_name, mobile, status, created_at, intake_source, assigned_gym_code_id")
        .eq("gym_id", gid)
        .gte("created_at", since90);
      visitorsQ = applyBranchEq(visitorsQ, "assigned_gym_code_id", branchIds);

      let membersQ = sb
        .from("members")
        .select("member_code, full_name, mobile, joining_date, status, deleted_at, assigned_gym_code_id, member_uuid")
        .eq("gym_id", gid)
        .is("deleted_at", null);
      membersQ = applyBranchEq(membersQ, "assigned_gym_code_id", branchIds);

      const [visitorsRes, membersRes, checkinsRes] = await Promise.all([
        visitorsQ.limit(3000),
        membersQ.limit(5000),
        sb
          .from("member_attendance_records")
          .select("id, checked_in_at, member_uuid")
          .eq("gym_id", gid)
          .gte("checked_in_at", since90)
          .limit(3000),
      ]);

      const normalizeMobile = (raw) => String(raw || "").replace(/\D/g, "").slice(-10);

      const memberByMobile = new Map();
      const uuidSet = new Set();
      for (const m of membersRes.data || []) {
        const mob = normalizeMobile(m.mobile);
        if (mob.length >= 10) memberByMobile.set(mob, m);
        if (m.member_uuid) uuidSet.add(String(m.member_uuid));
      }

      const matches = [];
      let unmatched = 0;
      for (const v of visitorsRes.data || []) {
        const mob = normalizeMobile(v.mobile);
        const hit = mob.length >= 10 ? memberByMobile.get(mob) : null;
        if (hit) {
          matches.push({
            visitorId: v.id,
            visitorName: v.full_name,
            visitorStatus: v.status,
            intakeSource: v.intake_source,
            memberCode: hit.member_code,
            memberName: hit.full_name,
            memberStatus: hit.status,
            joiningDate: hit.joining_date,
          });
        } else {
          unmatched += 1;
        }
      }

      let checkins = checkinsRes.data || [];
      if (branchIds != null) {
        checkins = checkins.filter((c) => uuidSet.has(String(c.member_uuid || "")));
      }
      const byDay = {};
      for (const c of checkins) {
        const day = String(c.checked_in_at || "").slice(0, 10);
        if (!day) continue;
        byDay[day] = (byDay[day] || 0) + 1;
      }

      return res.json({
        ok: true,
        branchScoped: branchIds != null,
        conversion: {
          method: "mobile-last10-match",
          note: "Read-only heuristic. Does not write conversion fields or change visitors/members.",
          visitors90d: (visitorsRes.data || []).length,
          matchedToMember: matches.length,
          unmatched,
          sample: matches.slice(0, 25),
        },
        footfall: {
          checkins90d: checkins.length,
          sparse: checkins.length < 5,
          uniqueMembers: new Set(checkins.map((c) => c.member_uuid).filter(Boolean)).size,
          byDay: Object.entries(byDay)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-30)
            .map(([day, count]) => ({ day, count })),
          message:
            checkins.length < 5
              ? "Low data — Member QR check-in is not widely used yet. Footfall charts unlock as check-ins grow."
              : null,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "analytics-growth-failed" });
    }
  });
}
