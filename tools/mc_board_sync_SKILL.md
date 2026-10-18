# Mission Control Board Sync (Doc → App)

One-way sync that carries task cards from the VANTRA Temporary Mission Control
board (Google Doc, Part 3 or whichever part is LIVE) into the Mission Control
app's Task entity, so anything the agent network posts on the Doc board shows
up in the app (Boss's phone) automatically.

Origin: Boss proof 2026-10-17 (video) — app searches for "Pankuch" and "Aaron"
returned 0 matches while the Doc board held the cards. Boss directive: make the
app pull its task list from the Doc board so there's only one list.

## Source of truth

LIVE board doc id (update when the board rolls to a new part):
`1w5d_3ty449oUKpLy2psh7I9nFsorUlE6Az2Dq3fPKBQ`  ("VANTRA TEMPORARY MISSION CONTROL — PART 3 (LIVE BOARD)")

When the board rolls to Part 4, update `DOC_ID` in `scripts/parse_board.py`,
and also update the sync note in the board doc itself.

## How to run (agent steps)

1. If `GOOGLEDOCS_ACCESS_TOKEN` is missing/expired in the sandbox, refresh it
   with the `get_connector_token` tool (integration_type `googledocs`,
   scope `https://www.googleapis.com/auth/documents`) before running.
2. Run: `run_skill mc-board-sync` (or run `scripts/parse_board.py` via bash).
   It fetches the doc text, hashes it, parses all cards, and writes
   `board_cards.json` (all parsed cards) and prints the doc hash.
3. Fast path (typical run): read the `McBoardWatchState` record with
   `stateKey == "board_sync"` via `read_entities`. If its `snapshot.docHash`
   equals the hash the script just printed, the board is unchanged — do
   nothing else. Stay silent.
4. If changed (or no snapshot yet): read the app's Task entity
   (`fields=["taskId","title","state"]`, paginate with skip until done) and
   save `taskId` + `state` pairs to a file the script can diff against.
   Run `python3 <skill_dir>/scripts/parse_board.py --app-tasks <file>` to get
   the diff (`new_cards.json` + `done_cards.json` + printed summary).
5. Apply the diff with the entity tools (`create_entity_records` /
   `update_entities`), using the rules below. Batch creates ~10 per call.
6. Write the new snapshot to `McBoardWatchState` (stateKey `board_sync`,
   snapshot = `{"docHash": "...", "cards": N, "importedTotal": N,
   "lastRun": "ISO"}`) with `update_entities` (query stateKey) or
   `create_entity_records` if no record exists.
7. Stay silent unless something needs Boss (per work-mode rules). Only text
   Boss if a new card is high/urgent AND owner is BOSS, or a blocker appears.
   Log significant runs (new imports, state flips, parse errors) to the
   VANTRA Build Log; silent no-change runs are NOT logged.

## Sync rules (v1)

- Match cards to tasks by card ID. App tasks with `taskId` matching
  `^[A-Z][A-Z0-9]+(-[A-Z0-9]+)*-[A-Z0-9]+$` are board-synced tasks (board IDs);
  app-native tasks have `task_<timestamp>_<rand>` ids. NEVER modify app-native
  tasks except flipping their state to COMPLETED when the board card with the
  same ID string in their title is marked DONE — and even then, only if the
  title contains the exact card ID.
- New card ID not in app → CREATE. Fields:
  - `taskId` = card ID (e.g. `COVERDISH-001`)
  - `title` = `[CARD-ID] <card title>`
  - `state`: map from card status: OPEN→READY, CLAIMED/ACTIVE→ACTIVE,
    WAITING→WAITING, DONE/RESOLVED→COMPLETED, BLOCKED→BLOCKED,
    BLK-* blocker lines→WAITING, unknown→READY
  - `priority`: URGENT/HIGH→high, SUPPORTING/LOW→low, else normal
  - `assignedAgent`: map owner (BOSS/Jeremy→BOSS, MUSE→VANTRA MUSE,
    GROK→VANTRA GROK, LILY→VANTRA LILY GROK, CHATGPT→OG VANTRA (ChatGPT),
    ELIO→ELIO, unclaimed→"")
  - `description` = card meta lines (Priority/Status/Owner, What, Done when,
    Next) truncated ~1200 chars, plus
    "[Board-sync import <date> from Mission Control board <Part N>. Source card: <doc url>]"
  - `stateHistory` is a JSON STRING, not an array:
    `[{"at":"<now>","actor":"ELIO","from":"","to":"<state>","reason":"Board sync <date>"}]`
  - `activityLog` = `<date> ELIO — board sync import from <part> (<reason>).`
  - `requiresApproval` = "no", `createdAt`/`updatedAt` = now ISO.
- Board card now DONE/RESOLVED and app task not COMPLETED → set app state
  COMPLETED (append stateHistory as a JSON string array entry).
- NEVER reopen: if the app task is COMPLETED and the card says OPEN, leave the
  app task completed and note the discrepancy in the run summary.
- Other state changes (READY↔ACTIVE↔WAITING): apply only to board-synced
  tasks when the card status clearly changed; if unsure, list in the run
  summary instead of writing.
- NEVER delete tasks. The doc board is narrative truth; the app keeps
  app-native tasks (e.g. BossTodo-style, test artifacts) untouched.

## Known limits (v1)

- Card parse covers the two known card shapes: `[ID] Title` blocks with
  `Priority: X | Status: X | Owner: X` lines, and lane lines
  `ID | Owner: X | ...`. Anything else on the Doc is not a task card.
- The doc-hash fast path means edits that do not change the text are not
  possible (Docs edits always change text), so it is safe.
- If parsing finds 0 new cards but Boss reports a missing search term, re-run
  with `--full-dump` and inspect manually — card format may have drifted.

## Files

- `scripts/parse_board.py` — fetch, hash, parse, diff. Env:
  `GOOGLEDOCS_ACCESS_TOKEN`. Args: `--app-tasks <file>` (JSON list of
  {taskId,state}), `--full-dump` (print all cards). Writes `board_cards.json`,
  `new_cards.json`, `done_cards.json` in the current directory.
