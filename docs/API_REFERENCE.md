# API Reference

## Health
- `GET /api/health`: overall runtime health and status checks.
- `GET /api/capabilities`: autonomy/runtime capabilities for WebUI wiring.

## Config
- `GET /api/model-catalog`: canonical provider catalog with provider order and ranked models.
- `GET /api/models?provider=<id>`: compatibility endpoint for provider model lists.
- `GET /api/config`: active provider model routing + model catalog + capabilities.
- `POST /api/config`: update provider/model routing and fallback.

## Sessions and Chat
- `GET /api/sessions`: list sessions.
- `POST /api/sessions`: create session.
- `GET /api/sessions/:id`: fetch session messages.
- `DELETE /api/sessions/:id`: delete session (compat placeholder).
- `POST /api/chat`: send prompt and receive assistant response.
- `GET /api/events`: event stream compatibility endpoint.

## Realtime
- `WS /ws`: tool execution events, status updates, and message stream.

## Missions
- `GET /api/missions`: list mission runs.
- `POST /api/missions/start`: start mission by goal.
- `GET /api/missions/status?id=<mission-id>`: mission state.
- `POST /api/missions/stop`: stop mission.
