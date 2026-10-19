#!/usr/bin/env python3
"""Mission Control board sync: fetch the live board Doc, parse cards, diff vs app tasks.

Env: GOOGLEDOCS_ACCESS_TOKEN (googledocs connector, documents scope).
Args:
  --app-tasks FILE   JSON list of {"taskId": "...", "state": "..."} from the Task entity
  --full-dump        print all parsed cards and exit
Writes: board_cards.json, new_cards.json, done_cards.json (cwd).
Prints: DOC_HASH <sha256> line first, then a summary.
"""
import argparse, hashlib, json, os, re, sys, urllib.request

DOC_ID = "1w5d_3ty449oUKpLy2psh7I9nFsorUlE6Az2Dq3fPKBQ"  # Part 3 (LIVE BOARD) — update on rollover
BOARD_URL = "https://docs.google.com/document/d/%s/edit" % DOC_ID
ID = r"[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+"
BOARD_TASK_ID = re.compile(r"^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-[A-Z0-9]+$")


def fetch_text():
    tok = os.environ.get("GOOGLEDOCS_ACCESS_TOKEN")
    if not tok:
        print("ERROR: GOOGLEDOCS_ACCESS_TOKEN not set — refresh with get_connector_token (googledocs, documents scope).")
        sys.exit(2)
    req = urllib.request.Request(
        "https://docs.googleapis.com/v1/documents/%s" % DOC_ID,
        headers={"Authorization": "Bearer " + tok})
    try:
        d = json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        print("ERROR: Docs API HTTP %d — token likely expired; refresh with get_connector_token." % e.code)
        sys.exit(2)
    parts = []
    for el in d.get("body", {}).get("content", []):
        if "paragraph" in el:
            parts.append("".join(r.get("textRun", {}).get("content", "")
                                 for r in el["paragraph"].get("elements", [])))
        elif "table" in el:
            for row in el["table"].get("tableRows", []):
                cells = []
                for c in row.get("tableCells", []):
                    ct = []
                    for p in c.get("content", []):
                        if "paragraph" in p:
                            ct.append("".join(r.get("textRun", {}).get("content", "")
                                              for r in p["paragraph"].get("elements", [])))
                    cells.append(" ".join(x for x in ct if x).strip())
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def parse_cards(text):
    lines = text.split("\n")
    cards = {}
    for i, l in enumerate(lines):
        m = re.match(r"^\[(" + ID + r")\]\s*(.+)$", l.strip())
        if m:
            cid, title = m.group(1), m.group(2).strip()
            if cid in cards:
                continue
            pri, status, owner = "", "", ""
            body = []
            for j in range(i + 1, min(i + 20, len(lines))):
                t = lines[j].strip()
                if re.match(r"^\[" + ID + r"\]", t) or re.match(r"^" + ID + r"\s*\|", t):
                    break
                if not t:
                    continue
                # 2026-10-19 fix: Priority used to be [A-Za-z/ ]+, so any P1/P2/P3/P4
                # or annotated priority ("P2 (assigned by ...)") killed the whole
                # metadata match and the card lost its status -> imported as BACKLOG.
                mm = re.match(r"^Priority:\s*(.+?)\s*\|\s*Status:\s*([^|]+?)\s*\|\s*Owner:\s*(.+)$", t)
                if mm and not pri:
                    pri, status, owner = mm.group(1).strip(), mm.group(2).strip(), mm.group(3).strip()
                    continue
                body.append(t)
            # fallback: cards that put Status on its own line ("Status: OPEN") or in
            # another combined line still deserve their state.
            if not status:
                for b in body:
                    ms = re.match(r"^Status:\s*(.+)$", b) or re.search(r"[|;]\s*Status:\s*([^|;]+)", b)
                    if ms:
                        status = ms.group(1).strip()
                        break
            # BLK-* blocker cards carry no Status line at all — they are blockers by ID.
            if not status and cid.startswith("BLK-"):
                status = "BLOCKED"
            cards[cid] = {"id": cid, "title": title, "priority": pri,
                          "status": status, "owner": owner, "body": body[:8],
                          "shape": "card"}
        else:
            meta = re.match(r"^(" + ID + r")\s*\|\s*Owner:\s*([^|]+)(.*)$", l.strip())
            if meta:
                cid = meta.group(1)
                if cid in cards:
                    continue
                rest = meta.group(3)
                st = re.search(r"Status:\s*([A-Z][A-Za-z-]+)", rest) or \
                     re.search(r"Blocker:\s*([A-Z][A-Za-z-]+)", rest)
                cards[cid] = {"id": cid, "title": None, "priority": "",
                              "status": (st.group(1).strip() if st else ""),
                              "owner": meta.group(2).strip(), "body": [l.strip()][:1],
                              "shape": "lane"}
    return cards


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app-tasks")
    ap.add_argument("--full-dump", action="store_true")
    ap.add_argument("--payload", action="store_true")
    args = ap.parse_args()

    text = fetch_text()
    h = hashlib.sha256(text.encode()).hexdigest()
    print("DOC_HASH " + h)
    cards = parse_cards(text)
    json.dump(cards, open("board_cards.json", "w"), indent=1)
    json.dump({"docHash": h, "cards": len(cards)}, open("/tmp/board_hash.json", "w"))
    print("CARDS %d" % len(cards))
    if args.full_dump:
        for k in sorted(cards):
            c = cards[k]
            print("-", k, "|", c["status"] or "?", "|", (c["title"] or "")[:70])
        return

    if args.payload:
        st = json.load(open("/tmp/board_hash.json"))
        new = json.load(open("new_cards.json"))
        done = json.load(open("done_cards.json"))
        # HOLD (Boss, 2026-10-19): no auto done-flip until JEN confirms.
        # Remove the ID from this set when Boss passes her confirmation.
        # DONE_HOLD released 2026-10-19: JEN passed CRM-SHOWCASE-001's privacy check (Part 3, 09:06 ET).
        held = []
        for d in held:
            print("HOLD: %s stays ACTIVE pending JEN confirmation" % d["taskId"])
        for c in new:
            c["body"] = "\n".join(c.get("body", [])[:10])[:1500]
        payload = {
            "changed": True,
            "docHash": st["docHash"],
            "docId": DOC_ID,
            "part": "Part 3 (LIVE BOARD)",
            "cards": st["cards"],
            "newCards": new,
            "doneIds": [d["taskId"] for d in done],
        }
        print("PAYLOAD_READY")
        print(json.dumps(payload))
        return

    if not args.app_tasks:
        print("NO_APP_TASKS — run with --app-tasks <file> to diff. Board cards saved to board_cards.json.")
        return
    app = json.load(open(args.app_tasks))
    app_by_id = {t["taskId"]: t for t in app if BOARD_TASK_ID.match(t.get("taskId", ""))}
    # also match board IDs embedded in app-native titles (legacy imports)
    title_ids = {}
    for t in app:
        m = re.search(r"(?:^|[^A-Z0-9-])\[?(" + ID + r")\]?", t.get("title", ""))
        if m:
            title_ids[m.group(1)] = t

    new, done, changed = [], [], []
    for cid in sorted(cards):
        c = cards[cid]
        s = (c["status"] or "").upper()
        at = app_by_id.get(cid) or title_ids.get(cid)
        if not at:
            new.append(c)
        elif at.get("state") not in ("COMPLETED", "CANCELLED") and "ACTIVE" not in s and "CLAIMED" not in s:
            # Only the status HEAD counts (before any parenthetical or em-dash detail),
            # so prose like "WAITING (diligence research pass DONE ...)" is not a done card.
            head = s.split("(")[0].split("\u2014")[0].strip()
            if "DONE" in head or "RESOLVED" in head:
                done.append({"taskId": at["taskId"], "card": c, "state": at.get("state")})
    json.dump(new, open("new_cards.json", "w"), indent=1)
    json.dump(done, open("done_cards.json", "w"), indent=1)
    print("NEW %d | DONE_FLIP %d" % (len(new), len(done)))
    for c in new:
        print("NEW:", c["id"], "|", (c["title"] or "")[:70])
    for d in done:
        print("DONE_FLIP:", d["taskId"], "is", d["state"], "| card says", d["card"]["status"][:40])
    print("NOTE: also check board_cards.json state wording vs app for boards-synced tasks if counts look off.")


if __name__ == "__main__":
    main()
