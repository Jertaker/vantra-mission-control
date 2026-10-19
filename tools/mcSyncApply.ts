// mcSyncApply — the ONLY writer in the Doc→app Mission Control board sync.
// The scheduled workflow's agent step fetches + parses + diffs the board and
// returns a JSON payload; the workflow's call step invokes this function with
// it. This function applies the changes to the Task entity as service role,
// so no background entity-tool approval is ever needed.
//
// SAFETY RULES (match the mc-board-sync skill):
//   - creates missing board cards only
//   - flips board-DONE cards to COMPLETED (never reopens, never deletes)
//   - never touches app-native tasks (task_...) except the documented DONE flip
//   - updates the McBoardWatchState 'board_sync' snapshot
//   - op:"reconcile" (correction rounds only): re-stamps state + project of
//     existing board cards from a full card list. Explicitly authorized by Boss.
//
// 2026-10-19 (v9.18 correction round):
//   - mapState rewritten: statuses VERIFYING/VERIFIED/IMPLEMENTED→REVIEW,
//     REVIEW→REVIEW, DEFERRED→BACKLOG, ACTION DUE→READY, BLOCKED/WAITING-BLOCKED→BLOCKED.
//   - mapPriority: P1/P2/P4 now match inside "P2 (assigned by ...)" style strings.
//   - DONE_HOLD released: JEN passed CRM-SHOWCASE-001's privacy check (Part 3, 09:06 ET).
//
// AUTH: called only by the workflow (as its creator, an admin).
//   401 anonymous, 403 non-admin.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// Project label rules — shared with mcTagProjects (keep both in sync).
function tagProject(taskId: string, title: string): string {
  const t = (title || "") + " " + taskId;
  const T = t.toUpperCase();
  if (/CRM|LOG-OUTCOME|WRITEBACK|SHEET/.test(T) && !/MISSION CONTROL/.test(T)) return "CRM";
  if (/FLEET|AGENT|ROBOT|WORKER|RESTORE|RESCUE|ROSTER/.test(T)) return "Agent Repair";
  if (/MUSIC|EPK|PRESS KIT|SONG|ALBUM|STEMS|AUDIO/.test(T)) return "Music";
  if (/ECO-|FVH|FUNNEL|HUB|PIPELINE/.test(T)) return "Ecosystem";
  if (/CONTENT|VIDEO|VLOG|FILM|YOUTUBE|CHANNEL|CF-/.test(T)) return "Content/Video";
  if (/PERSONAL|KITCHEN|RESTOCK|RECYCL|TRAVEL|VISIT|LIFE|HOME-|GEAR|BOOK|E-BIKE|VOUCHER|SEVERN/.test(T)) return "Personal";
  if (/MISSION CONTROL|MC-|OFFICE-|BOARD|SHOWCASE|SCREENS|TELEMETRY|COMMS/.test(T)) return "Mission Control";
  if (/BACKUP|SNAPSHOT/.test(T)) return "Backups";
  if (/REL-|OPS-|RELIAB|DURABLE|OWN-|ARCH/.test(T)) return "Ops/Reliability";
  if (/TEAM|PEACE/.test(T)) return "Team/Agents";
  return "";
}
function mapState(status: string): string {
  let s = (status || "").toUpperCase().trim();
  if (s.includes("ACTIVE")) return "ACTIVE"; // CLAIMED/ACTIVE and "Part 1 DONE / Part 2 ACTIVE"
  s = s.replace(/UNBLOCKED/g, ""); // "PARTIALLY UNBLOCKED" must NOT read as BLOCKED
  if (s.includes("BLOCKED") || s.startsWith("BLK")) return "BLOCKED";
  if (s.startsWith("DONE") || s.startsWith("RESOLVED")) return "COMPLETED";
  if (s.includes("VERIF") || s.startsWith("IMPLEMENTED")) return "REVIEW";
  if (s.startsWith("REVIEW")) return "REVIEW";
  if (s.startsWith("DEFERRED")) return "BACKLOG";
  if (s.includes("ACTION DUE")) return "READY";
  if (s.startsWith("OPEN")) return "READY";
  if (s.includes("WAITING") || s.startsWith("PENDING")) return "WAITING";
  return "BACKLOG";
}
function mapPriority(p: string): string {
  const s = (p || "").toUpperCase();
  if (s.includes("URGENT") || s.includes("CRITICAL") || /\bP1\b/.test(s)) return "urgent";
  if (s.includes("HIGH") || /\bP2\b/.test(s)) return "high";
  if (s.includes("LOW") || /\bP4\b/.test(s)) return "low";
  return "normal";
}
function mapOwner(o: string): string {
  if (!o) return "";
  const first = o.split(/[/+,]/)[0].replace(/\([^)]*\)/g, "").trim().toUpperCase();
  if (!first) return o.trim().slice(0, 50);
  if (first.includes("BOSS") || first.includes("JEREMY")) return "BOSS";
  if (first.includes("ELIO")) return "ELIO";
  return first.slice(0, 50);
}
function histJson(state: string, reason: string): string {
  return JSON.stringify([{ at: new Date().toISOString(), actor: "ELIO", from: "", to: state, reason }]);
}
function appendHist(t: any, from: string, to: string, reason: string): string {
  let hist: any[] = [];
  try { const p = JSON.parse(typeof t.stateHistory === "string" ? t.stateHistory : "[]"); if (Array.isArray(p)) hist = p; } catch { /* keep empty */ }
  hist.push({ at: new Date().toISOString(), actor: "ELIO", from, to, reason });
  return JSON.stringify(hist);
}
function buildDescription(card: any, docId: string): string {
  let lines = "";
  if (Array.isArray(card.body)) lines = card.body.slice(0, 8).join("\n");
  else if (typeof card.body === "string") lines = card.body;
  lines = lines.slice(0, 1200);
  return lines + `\n\n[Board-sync import from Mission Control board. Source: https://docs.google.com/document/d/${docId}/edit]`;
}

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
  const resp: string = typeof raw?.payloadJson === "string" ? raw.payloadJson : typeof raw === "string" ? raw : "";
  if (resp === "UNCHANGED") return Response.json({ ok: true, unchanged: true });
  if (resp.startsWith("ERROR")) return Response.json({ ok: true, errorReported: resp.slice(0, 200) });

  let p: any = null;
  try {
    p = resp ? JSON.parse(resp) : raw && typeof raw === "object" ? raw : null;
  } catch {
    return Response.json({ ok: true, unchanged: true, note: "payload not JSON — nothing applied, will retry next run" });
  }
  if (!p || typeof p !== "object" || !p.docHash) {
    return Response.json({ ok: true, unchanged: true, note: "no docHash — nothing applied" });
  }
  const docId = p.docId || "1w5d_3ty449oUKpLy2psh7I9nFsorUlE6Az2Dq3fPKBQ";
  const part = p.part || "";

  let tasks: any[] = [];
  try { tasks = await db.entities.Task.list(); } catch (e) {
    return Response.json({ ok: false, error: "task list failed: " + String((e && (e as any).message) || e) }, { status: 502 });
  }
  const byId = new Map<string, any>();
  for (const t of tasks) if (t.taskId) byId.set(t.taskId, t);

  const errors: string[] = [];

  // ---------------- correction-round reconcile ----------------
  if (p.op === "reconcile" && Array.isArray(p.cards)) {
    const fixed: string[] = [];
    const created: string[] = [];
    const alreadyOk: string[] = [];
    const projectStamps: string[] = [];
    for (const card of p.cards) {
      if (!card || !card.id) continue;
      const target = mapState(card.status);
      const t = byId.get(card.id);
      if (!t) {
        const st = target;
        try {
          await db.entities.Task.create({
            taskId: card.id,
            title: `[${card.id}] ${card.title || ""}`.slice(0, 300),
            state: st,
            priority: mapPriority(card.priority),
            assignedAgent: mapOwner(card.owner || ""),
            description: buildDescription(card, docId),
            project: tagProject(card.id, card.title || ""),
            stateHistory: histJson(st, "Board-sync reconcile create 2026-10-19"),
            activityLog: `Board-sync reconcile create 2026-10-19`,
          });
          created.push(card.id);
        } catch (e) {
          errors.push(card.id + ": " + String((e && (e as any).message) || e).slice(0, 120));
        }
        continue;
      }
      const patch: any = {};
      if (String(t.state).toUpperCase() !== target) {
        patch.state = target;
        patch.stateHistory = appendHist(t, t.state, target, "Board correction reconcile 2026-10-19 (status fix after parser bug)");
      }
      if (!String(t.project || "").trim()) {
        const proj = tagProject(card.id, card.title || "");
        if (proj) { patch.project = proj; projectStamps.push(card.id); }
      }
      if (Object.keys(patch).length) {
        try {
          patch.activityLog = `${t.activityLog ? t.activityLog + "\n" : ""}Board correction reconcile 2026-10-19`;
          await db.entities.Task.update(t.id, patch);
          fixed.push(card.id);
        } catch (e) {
          errors.push(card.id + ": " + String((e && (e as any).message) || e).slice(0, 120));
        }
      } else alreadyOk.push(card.id);
    }
    return Response.json({ ok: true, op: "reconcile", fixed, fixedCount: fixed.length, created, createdCount: created.length,
      projectStamps, projectStampCount: projectStamps.length, alreadyOkCount: alreadyOk.length, errors });
  }

  // ---------------- normal sync payload ----------------
  const newCards: any[] = Array.isArray(p.newCards) ? p.newCards : [];
  // DONE_HOLD released 2026-10-19: JEN passed CRM-SHOWCASE-001's privacy check (Part 3, 09:06 ET).
  const allDoneIds: string[] = Array.isArray(p.doneIds) ? p.doneIds : [];
  const doneIds = allDoneIds;

  const created: string[] = [];
  for (const card of newCards) {
    if (!card || !card.id || byId.has(card.id)) continue;
    const state = mapState(card.status);
    const rec = {
      taskId: card.id,
      title: `[${card.id}] ${card.title || ""}`.slice(0, 300),
      state,
      priority: mapPriority(card.priority),
      assignedAgent: mapOwner(card.owner || ""),
      description: buildDescription(card, docId),
      project: tagProject(card.id, card.title || ""),
      stateHistory: histJson(state, `Board-sync import ${new Date().toISOString().slice(0, 10)}`),
      activityLog: `Board-sync import from ${part || "board"} ${new Date().toISOString().slice(0, 10)}`,
    };
    try {
      await db.entities.Task.create(rec);
      created.push(card.id);
    } catch (e) {
      errors.push(card.id + ": " + String((e && (e as any).message) || e).slice(0, 120));
    }
  }

  const flipped: string[] = [];
  for (const id of doneIds) {
    const t = byId.get(id);
    if (!t) continue;
    if (String(t.state).toUpperCase() === "COMPLETED" || String(t.state).toUpperCase() === "CANCELLED") continue;
    try {
      await db.entities.Task.update(t.id, {
        state: "COMPLETED",
        stateHistory: appendHist(t, t.state, "COMPLETED", "Board card marked DONE — sync flip"),
        activityLog: `${t.activityLog ? t.activityLog + "\n" : ""}Board card marked DONE — auto flip by sync ${new Date().toISOString().slice(0, 10)}`,
      });
      flipped.push(id);
    } catch (e) {
      errors.push(id + ": " + String((e && (e as any).message) || e).slice(0, 120));
    }
  }

  // Refresh the watch-state snapshot that gates the fast path.
  let watch: any = null;
  try {
    const recs = await db.entities.McBoardWatchState.filter({ stateKey: "board_sync" });
    watch = recs && recs.length ? recs[0] : null;
  } catch { /* create below */ }
  const snapshot = JSON.stringify({
    docHash: p.docHash,
    cards: typeof p.cards === "number" ? p.cards : null,
    importedTotal: typeof p.importedTotal === "number" ? p.importedTotal : null,
    lastRun: new Date().toISOString(),
    docId,
    part: part || "Part 3 (LIVE BOARD)",
  });
  const notes = "Doc→app board sync state. docHash = sha256 of full live board text; set after the 2026-10-17/18 full reconcile. Fast path: if hash unchanged, skip. Update on board rollover to a new part doc.";
  try {
    if (watch) await db.entities.McBoardWatchState.update(watch.id, { snapshot, notes });
    else await db.entities.McBoardWatchState.create({ stateKey: "board_sync", snapshot, notes });
  } catch (e) {
    errors.push("snapshot-refresh: " + String((e && (e as any).message) || e).slice(0, 120));
  }

  return Response.json({
    ok: true,
    errors,
    created,
    createdCount: created.length,
    flipped,
    flippedCount: flipped.length,
    docHash: p.docHash,
  });
});
