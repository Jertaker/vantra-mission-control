// mcHealthApply — Health PHASE 1 snapshot writer (Boss spec, Working with Elio doc §7a, 2026-10-19).
// The health workflow's agent step runs the mc-health skill (gather_health.py), which
// collects all PHASE 1 signals from Drive/Sheets/GitHub/board and prints one JSON line.
// The agent then invokes THIS function with { payloadJson }. This function:
//   - merges in the live Base44 numbers (Task/Approval/MasterContact counts — sources
//     the gather script cannot reach)
//   - computes the CRM APPLY gates G1–G3
//   - upserts McBoardWatchState stateKey='health_snapshot' with the merged snapshot
// The client reads it through mcHealthApi (Boss-session auth). No secrets are stored.
//
// AUTH: same gate as mcSyncApply — 401 anonymous, 403 non-admin.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  let base44: any;
  try { base44 = createClientFromRequest(req); } catch {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ ok: false, error: "admin only" }, { status: 403 });
  const db = base44.asServiceRole;

  let raw: any = null;
  try { raw = await req.json(); } catch { /* fall through */ }
  const resp: string = typeof raw?.payloadJson === "string" ? raw.payloadJson : "";
  let g: any = null;
  try { g = resp ? JSON.parse(resp) : null; } catch {
    return Response.json({ ok: false, error: "payload not JSON" }, { status: 400 });
  }
  if (!g || typeof g !== "object") return Response.json({ ok: false, error: "empty payload" }, { status: 400 });

  const now = new Date().toISOString();

  // ---- live Base44 signals ----
  const live: any = { blocked: 0, waiting: 0, staleBlocked: 0, completed: 0, total: 0, pendingApprovals: 0, oldestPendingAt: null, crmCount: 0 };
  try {
    const tasks = await db.entities.Task.list();
    const week = Date.now() - 7 * 24 * 3600 * 1000;
    for (const t of tasks) {
      const st = String(t.state || "").toUpperCase();
      if (!["BACKLOG", "READY", "ACTIVE", "WAITING", "BLOCKED", "REVIEW", "COMPLETED"].includes(st)) continue;
      live.total++;
      if (st === "BLOCKED") { live.blocked++; if (new Date(t.updated_date || t.created_date || 0).getTime() < week) live.staleBlocked++; }
      if (st === "WAITING") live.waiting++;
      if (st === "COMPLETED") live.completed++;
    }
  } catch (e) { live.taskError = String((e && (e as any).message) || e).slice(0, 100); }
  try {
    const aps = await db.entities.Approval.filter({ status: "pending" });
    live.pendingApprovals = aps.length;
    let oldest = 0;
    for (const a of aps) { const ts = new Date(a.requestedAt || a.created_date || 0).getTime(); if (ts > oldest) oldest = ts; }
    if (aps.length) live.oldestPendingAt = new Date(oldest).toISOString();
  } catch (e) { live.approvalError = String((e && (e as any).message) || e).slice(0, 100); }
  try { const c = await db.entities.MasterContact.list(); live.crmCount = (c || []).length; } catch { /* keep 0 */ }

  // ---- CRM APPLY gates G1–G3 ----
  const gates: any = { g1: { open: true, note: "" }, g2: { open: true, note: "" }, g3: { open: true, note: "" } };
  const sheetRows = Number(g.crm?.sheetNamedRows || 0);
  if (live.crmCount >= sheetRows * 0.95 && sheetRows > 0) {
    gates.g1 = { open: false, note: `import done — ${live.crmCount} CRM records vs ${sheetRows} Sheet rows` };
  } else {
    gates.g1 = { open: true, note: `import not done — ${live.crmCount}/${sheetRows} rows in CRM` };
  }
  const exportAt = g.crm?.exportAt || "";
  gates.g2 = gates.g1.open
    ? { open: true, note: "waits on G1 (fresh full export after the import)" }
    : (exportAt ? { open: false, note: "fresh export present" } : { open: true, note: "no full export after the import yet" });
  const dupes = g.crm?.likelyDuplicates;
  gates.g3 = (typeof dupes === "number")
    ? (dupes === 0 ? { open: false, note: "0 likely duplicates in the newest DRY_RUN" } : { open: true, note: `${dupes} likely duplicates beyond the review list` })
    : { open: true, note: "newest DRY_RUN has no likely-duplicates field yet (updated sync script not installed)" };
  const applyOn = String(g.crm?.syncMode || "").toUpperCase() === "APPLY";
  const applyRedFlag = applyOn && (gates.g1.open || gates.g2.open || gates.g3.open);

  const snapshot = {
    at: now,
    crm: g.crm || {},
    backups: g.backups || {},
    board: g.board || {},
    runs: g.runs || {},
    apps: g.apps || {},
    ownership: g.ownership || {},
    keys: g.keys || {},
    team: g.team || {},
    docs: g.docs || {},
    reviewHold: g.reviewHold || {},
    live,
    gates,
    applyRedFlag,
  };

  let watch: any = null;
  try {
    const recs = await db.entities.McBoardWatchState.filter({ stateKey: "health_snapshot" });
    watch = recs && recs.length ? recs[0] : null;
  } catch { /* create below */ }
  const snapshotStr = JSON.stringify(snapshot);
  try {
    if (watch) await db.entities.McBoardWatchState.update(watch.id, { snapshot: snapshotStr, updatedAt: now });
    else await db.entities.McBoardWatchState.create({ stateKey: "health_snapshot", snapshot: snapshotStr, notes: "Health PHASE 1 snapshot (Boss spec §7a). Written by mcHealthApply from the mc-health gather payload. No secrets." });
  } catch (e) {
    return Response.json({ ok: false, error: "snapshot write failed: " + String((e && (e as any).message) || e).slice(0, 120) }, { status: 502 });
  }
  return Response.json({ ok: true, at: now, crmCount: live.crmCount, gates: { g1: gates.g1.open, g2: gates.g2.open, g3: gates.g3.open } });
});
