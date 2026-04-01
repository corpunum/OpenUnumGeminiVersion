# Architecture

## Runtime Isolation
- Home: `OPENUNUM_GEMINI_HOME` or `~/.openunum-gemini`
- Database: `~/.openunum-gemini/data/openunum.db`
- Service port: `OPENUNUM_GEMINI_PORT` (default `3000`)

## Core Modules
- `src/core/agent.ts`: autonomous task loop and strategy pivots.
- `src/core/memory.ts`: persistent SQLite tactical ledger + sessions/messages.
- `src/core/autonomy.ts`: health checks, retry limits, failure handling.
- `src/core/providers.ts`: provider-agnostic model interface.
- `src/ui/server.ts`: mission-control WebUI API and live updates.

## Provider Model
OpenUnumGeminiVersion uses an OpenAI-compatible chat interface and supports Ollama, OpenRouter, NVIDIA, and OpenAI via configurable base URL and API key.
