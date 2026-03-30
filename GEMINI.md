# OpenUnum: Gemini Version
## Autonomous Linux AI Assistant with Tactical Memory & Ghost Monitoring

OpenUnum is a minimalist, high-performance AI assistant designed for deep integration with Ubuntu/Linux environments. Built using **Bun**, it prioritizes **Hardware/Software Ownership**, **Tactical Learning**, and **Autonomous Resilience**.

---

## 🛠 Project Architecture

### 1. Neural Core (`src/core/`)
- **`agent.ts`**: The central brain. Implements a bounded autonomous "Step" loop with tactical context, deterministic pivots, anti-loop repetition detection, execution caps, planning-only mode, and final-answer forcing.
- **`memory.ts`**: SQLite-backed persistent memory. 
    - `messages`: Standard chat history.
    - `tactics`: The "Tactical Ledger." Stores every tool call's objective, action, outcome, and success status.
- **Session Behavior**: UI chat is persisted under session `ui` and is only cleared when `/new` is invoked.
- **`ghost.ts`**: The **Ghost Monitor**. A background process that "pokes" the agent via the system channel if it detects a pattern of 3+ failures, mandating a strategy pivot.
- **`providers.ts`**: Model-agnostic interface supporting Ollama, OpenRouter, NVIDIA, and OpenAI; includes model listing for provider dropdown population.

### 2. Tool Arsenal (`src/tools/`)
- **`exec.ts`**: Bun-native terminal execution. Allows the agent to run any shell command, install packages (`apt`), or manage services.
- **`files.ts`**: Surgical file operations (read, write, patch).
- **`browser.ts`**: Playwright-managed Chromium instance with a remote debugging port (9222) for visual tasks.

### 3. Control Center (`src/ui/`)
- **`server.ts`**: A Bun-based WebSocket/HTTP server.
    - **Port**: 3000 (default).
    - **Features**: Real-time status streaming, expandable "Tool Deployed" cards, interactive configuration hot-swapping, dynamic model loading, persisted chat history restore, and `/new` session reset.

---

## 🧠 Autonomous Principles (The "Limit-Breakers")

### Hardware Ownership
The agent is explicitly instructed that it **owns the hardware**. If a high-level tool (Browser) fails, it is programmed to pivot to low-level tools (CLI: `aria2`, `curl`, `huggingface-cli`) or build its own scripts to complete the task.

### Tactical Memory Loop
1. **Objective Received**: Agent queries `tactics` table for similar past goals.
2. **Strategy Formed**: Agent avoids "FAILED" actions and repeats "SUCCESSFUL" ones.
3. **Action Taken**: Result is recorded in the ledger.
4. **Failure Analysis**: If a tool fails, the agent records the error, increments a retry counter, and **re-steps itself** with a revised strategy.

### Safety & Stability Controls
- Repeated identical tool calls are detected and short-circuited to forced final responses.
- Tool executions per request are capped to prevent runaway loops.
- Raw provider tool-call markup is stripped from user-facing responses.
- Sensitive GitHub token patterns are redacted before persistence.
- Autonomous plan-lock mode now creates a step plan and instructs the agent to execute it without further user input.
- Self-heal retries inject corrective strategy instructions before giving up.
- File tools are restricted to the project root to avoid scope drift into unrelated repositories.
- Provider chat calls use retry logic for transient `500`/`429` responses.
- Oversized tool outputs are truncated before entering chat context.
- If provider retries still fail, agent returns best available evidence instead of throwing raw UI errors.
- Evidence fallback is summarized to avoid flooding the UI with full raw file/tool output.

### Ghost "Poke" System
If the agent is stuck in a loop, the `GhostMonitor` detects the pattern in the database and injects a `[GHOST POKE]` message into the system prompt, forcing a radical strategy change (e.g., "Switch to Terminal immediately").

---

## 🚀 Deployment & Usage

### One-Line Install/Update
```bash
/home/corp-unum/OpenUnumGeminiVersion/install.sh
```

### Accessing the Control Center
Open `http://localhost:3000` to interact with the agent. 

### Key Dependencies
- **Bun**: Runtime and package manager.
- **sqlite-vec**: For future vector-based RAG capabilities.
- **Playwright**: For browser automation.
- **aria2 / huggingface-hub**: For high-performance autonomous downloads.

---

## 📂 Directory Structure for Agents
```text
OpenUnumGeminiVersion/
├── src/
│   ├── core/          # Brain, Memory, Ghost Monitor
│   ├── tools/         # Exec, Files, Browser
│   ├── ui/            # Web Server & Frontend
│   ├── index.ts       # Entry Point & Service Init
├── openunum.db        # Tactical Ledger & Memory
├── openunum.service   # Systemd User Service
├── install.sh         # Autonomous Installer
└── GEMINI.md          # This Documentation
```
