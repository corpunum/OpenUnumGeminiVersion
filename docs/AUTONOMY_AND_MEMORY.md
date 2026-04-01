# Autonomy and Memory

## Autonomy Model
- Bounded autonomous loop with anti-loop guardrails.
- Deterministic pivot strategy when a tool path fails repeatedly.
- Ghost monitor injects corrective prompts after repeated failures.

## Tactical Memory
- SQLite tactical ledger records objective, action, outcome, and success state.
- Persisted sessions/messages restore WebUI history.
- Similar tactic retrieval guides next execution strategy.

## Runtime Path Policy
- Persistent memory must live under `~/.openunum-gemini/data/`.
- Legacy root-level DB (`openunum.db`) is migrated automatically at startup when needed.
