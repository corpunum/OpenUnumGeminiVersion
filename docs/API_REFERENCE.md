# API Reference

## Health
- `GET /api/health`: overall runtime health and status checks.

## Config
- `GET /api/config`: active provider/model and UI settings.
- `POST /api/config`: update provider/model and runtime options.
- `GET /api/models`: list available models for current provider.

## Sessions and Chat
- `GET /api/chat/history`: retrieve persisted chat history.
- `POST /api/chat`: send prompt and receive assistant response.
- `/new` command in chat clears active session history.

## Realtime
- `WS /ws`: tool execution events, status updates, and message stream.
