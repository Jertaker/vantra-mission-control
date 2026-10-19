#!/usr/bin/env python3
"""Append one row to the VANTRA Ops — Control 'Runs' tab for every board-sync run.
Env: GOOGLESHEETS_ACCESS_TOKEN. Args:
  --hash H --changed y|n --mismatches N --held IDS_OR_DASH --result TEXT
Writes: [job=board-sync, started=ts ET, "", result, "", hash, changed, mismatches, held, detail]
"""
import argparse, os, urllib.request, json
SS = "1jX06V_TMvCwbnPxQaud3hrLt2S817bhvGC9b1amreOk"
def call(method, path, body=None):
    tok = os.environ.get("GOOGLESHEETS_ACCESS_TOKEN")
    req = urllib.request.Request("https://sheets.googleapis.com/v4/spreadsheets/" + SS + path,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + (tok or ""), "Content-Type": "application/json"},
        method=method)
    return json.load(urllib.request.urlopen(req))
ap = argparse.ArgumentParser()
ap.add_argument("--hash", required=True); ap.add_argument("--changed", required=True)
ap.add_argument("--mismatches", default="0"); ap.add_argument("--held", default="-")
ap.add_argument("--result", required=True); ap.add_argument("--ts", default="")
a = ap.parse_args()
ts = a.ts
if not ts:
    import datetime
    ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).strftime("%Y-%m-%d %H:%M:%S ET")
hdr = call("GET", "/values/Runs!A1:J1").get("values", [[]])[0]
want = ["job","started","finished","result","counts","hash","changed","mismatches","held","detail"]
if len(hdr) < 10 or hdr[5:10] != want[5:10]:
    call("PUT", "/values/Runs!A1:J1?valueInputOption=USER_ENTERED", {"range":"Runs!A1:J1","values":[want]})
call("POST", "/values/Runs!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
     {"range":"Runs!A:J","values":[["board-sync", ts, "", a.result, "", a.hash[:16], a.changed, a.mismatches, a.held, a.hash]]})
print("RUNS_ROW_OK")
