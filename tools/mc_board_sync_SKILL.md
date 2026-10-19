# Mission Control Board Sync (Doc -> App)

Keeps the Task entity in sync with the Temporary Mission Control board doc (Part 3, LIVE BOARD).
Trigger: scheduled workflow "Sync Mission Control Board to App" (every 30 min).

Doc ID: 1w5d_3ty449oUKpLy2psh7I9nFsorUlE6Az2Dq3fPKBQ
Writer: backend function mcSyncApply (the ONLY writer; agent step never writes entities directly).

## Every run (5 steps, in order)

1. Fetch tokens: get_connector_token googledocs (documents scope) AND googlesheets (spreadsheets scope).
2. Run the parser:
   `python3 /app/.agents/skills/mc-board-sync/scripts/parse_board.py --full-dump`
   It prints `DOC_HASH <sha256>` first, then all parsed cards.
3. Compare the hash to the snapshot in McBoardWatchState stateKey=board_sync (read_entities).
   - SAME hash: append the Runs row (step 5) with changed=n, mismatches=0, then reply exactly
     `UNCHANGED` and STOP. No diff, no apply call, no report, no broadcast. Fully silent.
4. CHANGED hash: build the apply payload.
   `python3 .../parse_board.py --app-tasks <app tasks file>`  (read_entities Task: taskId, state -> JSON file)
   then `python3 .../parse_board.py --payload` -> single-line JSON payload.
   The payload already filters DONE flips against the app state (only flips cards whose app state
   is not COMPLETED/CANCELLED). Reply with the payload JSON, single line, nothing else.
5. ALWAYS append the Runs row, changed or not:
   `python3 /app/.agents/skills/mc-board-sync/scripts/runs_log.py --hash <hash> --changed y|n --mismatches <n> --held <ids|-> --result APPLIED|UNCHANGED|ERROR...`
   (mismatches = new cards + pending done-flips; 0 when unchanged)

## Rules
- Board doc is narrative truth; the app never reopens a task outside an explicit correction round.
- Report to Boss ONLY when the board changed: ONE short broadcast covering only new cards (id + title)
  and done-flips (ids). No report on unchanged runs.
- DONE_HOLD was released 2026-10-19: JEN passed CRM-SHOWCASE-001's privacy check (Part 3, 09:06 ET),
  and Boss confirmed the release. No card is held from a DONE flip right now.
- On fetch/parse failure: reply `ERROR <one line>`, still write the Runs row with result ERROR.
- Never print secrets or tokens in any reply or report.
