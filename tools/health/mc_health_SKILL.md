# Mission Control Health Refresh (PHASE 1)

Trigger: scheduled workflow "Mission Control Health Refresh" (every 30 min, offset from the board sync).
Keeps the Health PHASE 1 snapshot fresh (Boss spec, Working with Elio doc §7a, 2026-10-19).

## Every run (3 steps, fully silent)

1. Fetch tokens: get_connector_token for googledrive (drive scope), googlesheets
   (spreadsheets scope), and googledocs (documents scope).
2. Run the gatherer and capture its single-line JSON output:
   `python3 /app/.agents/skills/mc-health/scripts/gather_health.py`
3. Invoke the deployed backend function mcHealthApply with a POST body
   {"payloadJson": "<the JSON line>"} (test_backend_function/call_base44_backend_function),
   then reply exactly `HEALTH_UPDATED`. If the gatherer printed an error or empty output,
   reply `ERROR <one line>` — the previous snapshot stays in place.

Rules: never print tokens or secrets; the gatherer stores status/dates only.
The client reads the snapshot via mcHealthApi; nothing is broadcast to Boss.
