# OpenUnum: Gemini Version 🚀
### The Hardened, Autonomous Linux AI Assistant

OpenUnum (Gemini Version) is a next-generation autonomous agent framework built for Ubuntu/Linux. Unlike traditional "chatbot" agents, OpenUnum is engineered with a **Zero-Trust Autonomous Architecture**. It treats model speculative output as secondary to tool-based truth, ensuring high reliability in system management, web browsing, and mission-critical tasks.

---

## ✨ Key Features

### 🧠 Tactical Memory & Learning
Every action OpenUnum takes is recorded in a **Tactical Ledger** (SQLite). The agent learns from its own "Audit Trail," avoiding previously failed strategies and favoring proven successes for specific objectives.

### 👻 Ghost Monitor (Active Resilience)
A background watchdog process continuously monitors the agent's performance. If OpenUnum hits a recursive loop or fails 3+ times on a single task, the Ghost Monitor injects a **[GHOST POKE]**—a mandatory strategy correction that forces the agent to pivot (e.g., from Browser to CLI).

### 🛡️ Hardened Proof-of-Work (PoW)
OpenUnum does not trust its own "I am done" claims. It must **prove** completion through successful tool executions. If the agent claims success without tool-based evidence, the system rejects the output and mandates a re-execution.

### 🎮 Mission Control UI
A high-performance, real-time Web UI (`http://localhost:3000`) that provides:
- **Interactive Tool Cards**: Expandable blocks showing raw tool calls, parameters, and results.
- **Pulsing Telemetry**: Live status updates showing the agent's internal "thinking" and "iteration" cycles.
- **Dynamic Configuration**: Hot-swap LLM providers (Ollama, NVIDIA, OpenRouter, OpenAI) without restarting.
- **Persistent Chat History**: Conversations are stored locally and restored after browser refresh.
- **Explicit Reset**: Type `/new` in chat to clear history and start a clean session.

### 🤖 Autonomous Execution Mode
- The agent now auto-generates an execution plan per request and attempts to follow it step-by-step.
- Self-healing is built in: repeated-tool loops trigger recovery prompts and strategy pivots.
- Safety caps remain enabled to prevent runaway tool execution.
- Workspace guardrails keep file operations inside `/home/corp-unum/OpenUnumGeminiVersion`.
- Large tool outputs are truncated to keep provider context stable.

### 💻 Hardware & Software Ownership
The agent is explicitly authorized to own the system. If a tool is missing, it installs it. If a website is slow, it pivots to `aria2`, `curl`, or `huggingface-cli` to get the job done.

---

## 🛠️ System Architecture

### Neural Core (`src/core/`)
- **`agent.ts`**: Implements a bounded autonomous loop with anti-loop guards, execution caps, planning-only mode detection, and safe final-response fallback.
- **`providers.ts`**: Handles OpenAI-compatible chat and dynamic model discovery (`/models`) across providers.
- **`ghost.ts`**: The external "nudge" loop for active failure recovery.
- **`memory.ts`**: Manages persistent SQLite storage for chat history, tactics, and explicit session resets.

### Tool Arsenal (`src/tools/`)
- **Execution**: Bun-native `spawn` for safe terminal interaction.
- **Browser**: Playwright-managed Chromium with full visibility (`headless: false`) and 9222 CDP port.
- **Files**: Surgical I/O for patching and reading system files.

---

## 🚀 Getting Started

### 1. One-Line Installation
Run the autonomous installer to set up the Bun runtime, dependencies, and systemd service:
```bash
/home/corp-unum/OpenUnumGeminiVersion/install.sh
```

### 2. Launching the UI
Open your browser to:
`http://localhost:3000`

### 2.1 Chat Persistence
- Refresh-safe history is loaded automatically from local SQLite.
- Use `/new` in the chat box to clear only the active UI session.

### 3. Running via CLI
```bash
bun run src/index.ts
```

---

## 📂 Project Structure (Agent Brief)
Designed for seamless onboarding of secondary agents (Codex, etc.):
```text
OpenUnumGeminiVersion/
├── src/
│   ├── core/          # Brain, Strategy, Persistence
│   ├── tools/         # Hardware Interaction (Exec, Browser, Files)
│   ├── ui/            # Mission Control Server
│   ├── index.ts       # Service Entry & Init
├── openunum.db        # The Tactical Ledger
├── openunum.service   # Linux Service Definition
├── install.sh         # Deployment Logic
└── GEMINI.md          # Internal Agent Documentation
```

---

## 🛡️ Deterministic Pivot Policy
When a high-level interaction (like Browser navigation) fails twice in a single mission, OpenUnum's **TacticalRouter** deterministically disables that tool and forces a switch to low-level CLI alternatives. This "Pivot Enforcement" is the core of OpenUnum's mission success rate.

---

## 🤝 Contributing
OpenUnum is designed to be self-documenting and auditable. Please refer to `GEMINI.md` for deep architectural insights before contributing.

---
*Created with ❤️ for the Master of the Hardware.*
