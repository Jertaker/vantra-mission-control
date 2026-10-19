// mcHealthApi — read-only endpoint for the client Health page (PHASE 1).
// Same Boss-session auth as missionControlApi. Returns the health_snapshot written
// by mcHealthApply. GET or POST; no body needed.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  try {
    let base44: any;
    try { base44 = createClientFromRequest(req); } catch {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers });
    }
    const db = base44.asServiceRole;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return new Response(JSON.stringify({ ok: false, error: "missing session token" }), { status: 401, headers });
    const tokenHash = await sha256hex(authHeader.substring(7));
    const sessions = await db.entities.McSession.filter({ token: tokenHash });
    if (!sessions || !sessions.length) return new Response(JSON.stringify({ ok: false, error: "invalid session" }), { status: 401, headers });
    const s = sessions[0];
    if (s.expiresAt && s.expiresAt < new Date().toISOString()) return new Response(JSON.stringify({ ok: false, error: "session expired" }), { status: 401, headers });
    try { await db.entities.McSession.update(s.id, { lastSeenAt: new Date().toISOString() }); } catch { /* non-fatal */ }
    const recs = await db.entities.McBoardWatchState.filter({ stateKey: "health_snapshot" });
    if (!recs || !recs.length) return new Response(JSON.stringify({ ok: true, snapshot: null, note: "no health snapshot yet" }), { headers });
    let snap: any = null;
    try { snap = JSON.parse(recs[0].snapshot); } catch { snap = null; }
    return new Response(JSON.stringify({ ok: true, snapshot: snap, at: new Date().toISOString() }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && (e as any).message) || e).slice(0, 120) }), { status: 500, headers });
  }
});
