#!/usr/bin/env python3
"""Health PHASE 1 gatherer (Boss spec, Working with Elio §7a, 2026-10-19).
Collects every PHASE 1 signal from Drive/Sheets/GitHub/board and prints ONE JSON line
(payload for mcHealthApply). Env: GOOGLEDRIVE_ACCESS_TOKEN, GOOGLESHEETS_ACCESS_TOKEN,
GOOGLEDOCS_ACCESS_TOKEN. No secrets are printed or stored — status/dates only.
"""
import json, os, re, sys, urllib.request

BK = "1ViLXN2LmvaJdeRuLsO095eG9tW_9fX_4"      # CRM backups folder
DR = "1g1HG4GdyLKLkyYohI6OvEPoH4BPQh9EV"      # DRY_RUN logs folder
OC = "1jX06V_TMvCwbnPxQaud3hrLt2S817bhvGC9b1amreOk"  # Ops Control
MC = "1GnsFNbTiy9WeTXx3i56gjkuT9ux24FHAnmd-cAwAcG0"  # MC Data
CD = "11qfT2QyNhUP2oVvMnIjIe23KDCjg3Tv7ZDdjcBfZcPY"  # CRM Data
REG = "1UPFuP4Y9oeuUf42Uq8TEff9aJ6XEwbIWqsnmkS-C0NU" # Audit register
P3 = "1w5d_3ty449oUKpLy2psh7I9nFsorUlE6Az2Dq3fPKBQ"  # live board

def drv(tok, path):
    req = urllib.request.Request("https://www.googleapis.com/drive/v3/" + path,
        headers={"Authorization": "Bearer " + tok})
    return json.load(urllib.request.urlopen(req))
def sheet(tok, ss, rng):
    req = urllib.request.Request(f"https://sheets.googleapis.com/v4/spreadsheets/{ss}/values/{urllib.request.quote(rng)}",
        headers={"Authorization": "Bearer " + tok})
    return json.load(urllib.request.urlopen(req))
def sheet_tabs(tok, ss):
    req = urllib.request.Request(f"https://sheets.googleapis.com/v4/spreadsheets/{ss}?fields=sheets.properties.title",
        headers={"Authorization": "Bearer " + tok})
    return [s["properties"]["title"] for s in json.load(urllib.request.urlopen(req)).get("sheets", [])]

def main():
    T = {k: os.environ.get(k) for k in ("GOOGLEDRIVE_ACCESS_TOKEN", "GOOGLESHEETS_ACCESS_TOKEN", "GOOGLEDOCS_ACCESS_TOKEN")}
    out = {}
    err = []

    # ---- CRM: backups + DRY_RUN ----
    try:
        files = drv(T["GOOGLEDRIVE_ACCESS_TOKEN"], f"files?q='{BK}'+in+parents&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc&pageSize=200").get("files", [])
        newest_exp = next((f for f in files if f["name"].startswith("vantra-crm-full-")), None)
        jgl = next((f for f in files if f["name"].startswith("JGL snapshot")), None)
        wb = {}
        for f in files:
            for tag in ("CRM Data", "MC Data", "Ops Audit"):
                if f["name"].startswith(tag + " snapshot") and tag not in wb:
                    wb[tag] = {"name": f["name"], "at": f["modifiedTime"]}
        out["backups"] = {"jglAt": jgl["modifiedTime"] if jgl else None, "workbooks": list(wb.values())}
        out["crm"] = {"exportAt": newest_exp["modifiedTime"] if newest_exp else None,
                      "exportName": newest_exp["name"] if newest_exp else None}
    except Exception as e:
        err.append("bk:" + str(e)[:80])
    try:
        dr = drv(T["GOOGLEDRIVE_ACCESS_TOKEN"], f"files?q='{DR}'+in+parents&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc&pageSize=5").get("files", [])
        if dr:
            req = urllib.request.Request("https://www.googleapis.com/drive/v3/files/%s?alt=media" % dr[0]["id"],
                headers={"Authorization": "Bearer " + T["GOOGLEDRIVE_ACCESS_TOKEN"]})
            dry = json.load(urllib.request.urlopen(req))
            c = dry.get("counts", {})
            out["crm"].update({
                "syncMode": dry.get("mode", "?"),
                "syncAt": dry.get("at"),
                "syncErrors": len(dry.get("errors", [])),
                "reviewCount": c.get("review"),
                "reviewByReason": c.get("reviewByReason"),
                "likelyDuplicates": c.get("likelyDuplicates"),   # present only after the updated sync script is installed
                "sheetNamedRows": c.get("sheetNamedRows"),
            })
        out.setdefault("crm", {})
    except Exception as e:
        err.append("dr:" + str(e)[:80])
        out.setdefault("crm", {})

    # ---- board modified times + shipped version + ownership cards ----
    out["board"] = {}
    try:
        out["board"]["p3At"] = drv(T["GOOGLEDRIVE_ACCESS_TOKEN"], f"files/{P3}?fields=modifiedTime").get("modifiedTime")
        q = drv(T["GOOGLEDRIVE_ACCESS_TOKEN"], "files?q=" + urllib.request.quote("name contains 'Mission Control' and name contains 'Part 2'") + "&fields=files(id,name,modifiedTime)")
        if q.get("files"): out["board"]["p2At"] = max(f["modifiedTime"] for f in q["files"])
    except Exception as e:
        err.append("bd:" + str(e)[:80])
    try:
        req = urllib.request.Request("https://docs.googleapis.com/v1/documents/" + P3,
            headers={"Authorization": "Bearer " + (T["GOOGLEDOCS_ACCESS_TOKEN"] or "")})
        d = json.load(urllib.request.urlopen(req))
        parts = []
        for el in d.get("body", {}).get("content", []):
            if "paragraph" in el:
                parts.append("".join(r.get("textRun", {}).get("content", "") for r in el["paragraph"].get("elements", [])))
        text = "\n".join(parts)
        ships = re.findall(r"\[V(\d+(?:\.\d+)*) SHIPPED\]", text, re.I)
        out["apps"] = {"boardShipped": max(ships, key=lambda v: [int(x) for x in v.split(".")]) if ships else None}
        own = {}
        for cid in ("MC-OWNERSHIP-001", "BASE44-EXIT-001", "REL-003"):
            m = re.search(r"\[" + re.escape(cid) + r"\][^\n]*\n((?:[^\n]*\n){0,3})", text)
            seg = m.group(1) if m else ""
            sm = re.search(r"Status:\s*([A-Z][A-Za-z/ -]+)", seg)
            own[cid] = (sm.group(1).strip() if sm else ("OPEN" if cid == "REL-003" else "?"))
        out["ownership"] = own
    except Exception as e:
        err.append("p3:" + str(e)[:80])
        out.setdefault("apps", {}); out.setdefault("ownership", {})

    # ---- Ops Control: Runs + AgentKeys ----
    ST = T["GOOGLESHEETS_ACCESS_TOKEN"]
    try:
        rows = sheet(ST, OC, "Runs!A2:J").get("values", [])
        if rows:
            r = rows[-1]
            out["runs"] = {"ts": r[1] if len(r) > 1 else "", "hash": (r[9] if len(r) > 9 else (r[5] if len(r) > 5 else "")),
                           "changed": r[6] if len(r) > 6 else "", "mismatches": r[7] if len(r) > 7 else "0",
                           "held": r[8] if len(r) > 8 else "-", "result": r[3] if len(r) > 3 else ""}
        else:
            out["runs"] = None
    except Exception as e:
        err.append("runs:" + str(e)[:80]); out["runs"] = None
    try:
        ak = sheet(ST, OC, "AgentKeys!A2:H50").get("values", [])
        keys = {"rows": len(ak), "active": 0, "expiringSoon": 0, "expiredUsed": 0, "names": []}
        nowms = __import__("time").time() * 1000
        for r in ak:
            if not r or not any(x.strip() for x in r): continue
            keys["names"].append(r[0] if r else "?")
            stt = (r[4] if len(r) > 4 else "active").lower()
            exp = r[3] if len(r) > 3 else ""
            lu = r[5] if len(r) > 5 else ""
            if stt in ("active", "enabled"):
                keys["active"] += 1
                try:
                    if exp and float(exp) < nowms + 7 * 86400000: keys["expiringSoon"] += 1
                except Exception: pass
                try:
                    if lu and float(lu) > float(exp or 0) and exp: keys["expiredUsed"] += 1
                except Exception: pass
        out["keys"] = keys
    except Exception as e:
        err.append("keys:" + str(e)[:80]); out.setdefault("keys", {})

    # ---- MC Data: Heartbeats + Agents ----
    try:
        tabs = sheet_tabs(ST, MC)
        hb_tab = next((t for t in tabs if "heartbeat" in t.lower()), None)
        ag_tab = next((t for t in tabs if "agent" in t.lower()), None)
        # Agents tab: agent_id, name, ..., state, last_heartbeat, current_task
        agents = {}
        if ag_tab:
            for r in sheet(ST, MC, f"'{ag_tab}'!A2:K80").get("values", []):
                if r and any(x.strip() for x in r):
                    agents[(r[0] if r else "").strip()] = {"name": (r[1] if len(r) > 1 else "?"), "state": (r[7] if len(r) > 7 else ""), "task": (r[9] if len(r) > 9 else "")}
        # Heartbeats tab: heartbeat_id, ts, agent_id, state
        latest = {}
        if hb_tab:
            for r in sheet(ST, MC, f"'{hb_tab}'!A2:D400").get("values", []):
                if r and any(x.strip() for x in r):
                    aid = (r[2] if len(r) > 2 else "").strip()
                    a = agents.get(aid, {})
                    latest[aid] = {"name": a.get("name") or aid[:8], "ts": (r[1] if len(r) > 1 else ""), "state": (r[3] if len(r) > 3 else ""), "task": a.get("task", "")}
        out["team"] = {"agents": list(latest.values())}
    except Exception as e:
        err.append("mc:" + str(e)[:80]); out.setdefault("team", {"agents": []})

    # ---- CRM Data: ReviewHold ----
    try:
        tabs = sheet_tabs(ST, CD)
        rh_tab = next((t for t in tabs if "review" in t.lower()), tabs[0] if tabs else None)
        held = ask = boss = 0
        if rh_tab:
            vals = sheet(ST, CD, f"'{rh_tab}'!A2:Z1000").get("values", [])
            for r in vals:
                if not any(c.strip() for c in r): continue
                held += 1
                ab = (r[13] if len(r) > 13 else "").strip().lower()
                ba = (r[17] if len(r) > 17 else "").strip()
                if ab == "yes": ask += 1
                if ab == "yes" and not ba: boss += 1
        out["reviewHold"] = {"held": held, "askBoss": ask, "bossOpen": boss}
    except Exception as e:
        err.append("rh:" + str(e)[:80]); out.setdefault("reviewHold", {})

    # ---- Audit register ----
    try:
        tabs = sheet_tabs(ST, REG)
        reg_tab = next((t for t in tabs if "register" in t.lower()), tabs[0] if tabs else None)
        counts, p0update, oldest = {}, 0, ""
        if reg_tab:
            vals = sheet(ST, REG, f"'{reg_tab}'!A2:K200").get("values", [])
            for r in vals:
                if not any(c.strip() for c in r): continue
                status = (r[8] if len(r) > 8 else "").strip()
                p0 = (r[6] if len(r) > 6 else "").strip()
                lv = (r[10] if len(r) > 10 else "").strip()
                if status:
                    counts[status] = counts.get(status, 0) + 1
                    if "P0" in p0.upper() and status.upper() == "UPDATE NEEDED": p0update += 1
                    if lv and (not oldest or lv < oldest): oldest = lv
        out["docs"] = {"statusCounts": counts, "p0UpdateNeeded": p0update, "oldestVerified": oldest or None}
    except Exception as e:
        err.append("reg:" + str(e)[:80]); out.setdefault("docs", {})

    # ---- GitHub latest commit ----
    try:
        req = urllib.request.Request("https://api.github.com/repos/jertaker/vantra-mission-control/commits/main",
            headers={"User-Agent": "mc-health"})
        c = json.load(urllib.request.urlopen(req))
        out["apps"]["commitAt"] = c["commit"]["committer"]["date"]
        out["apps"]["commitSha"] = c["sha"][:7]
        out["apps"]["commitMsg"] = c["commit"]["message"].split("\n")[0][:80]
    except Exception as e:
        err.append("gh:" + str(e)[:80])

    out["gatherErrors"] = err
    print(json.dumps(out, separators=(",", ":")))

if __name__ == "__main__":
    main()
