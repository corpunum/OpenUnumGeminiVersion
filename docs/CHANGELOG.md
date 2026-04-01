# Changelog

## Unreleased
- Standardized WebUI/API contract to cross-repo baseline:
  - Added `/api/capabilities`, `/api/model-catalog`, `/api/models` compatibility, `/api/events`.
  - Added mission endpoints: `/api/missions`, `/api/missions/start`, `/api/missions/status`, `/api/missions/stop`.
  - Added shared WebUI shell with standardized routing/session/chat controls.
- Added model-catalog and WebUI contract e2e tests (`phase1`, `phase2`) and `npm` scripts.
- Enforced localhost runtime defaults (`OPENUNUM_GEMINI_HOST=127.0.0.1`, `OPENUNUM_GEMINI_PORT=18884`) with migration from legacy persisted port `3000`.
- Updated service/install/docs to the `127.0.0.1:18884` default.
- Moved persistent runtime DB default to `~/.openunum-gemini/data/openunum.db`.
- Added `OPENUNUM_GEMINI_HOME` and `OPENUNUM_GEMINI_PORT` runtime support.
- Replaced ambiguous service file with `openunum-gemini.service`.
- Added operations runbook for onboarding and service management.
- Added startup migration from legacy DB paths to the isolated runtime DB path.
- Added docs baseline files: `INDEX.md`, `ARCHITECTURE.md`, `API_REFERENCE.md`, and `AUTONOMY_AND_MEMORY.md`.
