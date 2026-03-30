# Implementation Plan: OpenUnum (Gemini Version)

- **Plan (Backup):** `/home/corp-unum/OpenUnumGeminiVersion/OpenUnum_Plan.md`
- **Root Directory:** `/home/corp-unum/OpenUnumGeminiVersion`
- **Source Code:** `/home/corp-unum/OpenUnumGeminiVersion/src/`
- **Database/Memory:** `/home/corp-unum/OpenUnumGeminiVersion/openunum.db`

OpenUnum is a high-performance, minimalist AI assistant designed for Ubuntu/Linux. It takes the best components from the OpenClaw ecosystem (miniclawd, SmallClaw, Nanobot) and merges them into a single, auditable Bun-based project.

## Project Vision
- **Lightweight:** < 10,000 lines of core code.
- **Model Agnostic:** Hot-switch between Ollama, OpenRouter, NVIDIA, and OpenAI.
- **System Native:** Deep integration with Linux (Systemd, Apt, File System).
- **Remote Debuggable:** Developer Chromium instance with CDP (Port 9222).

---

## Phase I: Core Architecture & Models (ETA: 1.5h)

### Objective
Establish the Bun environment, unified provider interface, and SQLite-based memory.

### Implementation Steps
1. **Init:** Set up Bun project with `sqlite-vec` and `ajv`.
2. **Providers:** Implement `ModelProvider` class supporting OpenAI-compatible APIs (Ollama, OpenRouter, NVIDIA).
3. **Agent Loop:** Build the "Step" function (Thought -> Action -> Result).
4. **Memory:** Create `light-memory` using SQLite vector table for RAG on `.md` files.

### E2E Testing
- Verify model switching mid-session.
- Confirm RAG retrieval of workspace context.

---

## Phase II: Local Tools & Developer Chromium (ETA: 1.5h)

### Objective
Enable the agent to manage the system and browse the web via a debuggable Chromium instance.

### Implementation Steps
1. **Exec:** Bun-native `run_command` with approval flow.
2. **Files:** Surgical `patch_file` and basic I/O.
3. **Chromium:** Start Playwright-managed Chromium with `--remote-debugging-port=9222`.
4. **Web UI:** Minimalist, mobile-friendly dashboard for chat and "Live View" screenshots.

### E2E Testing
- Agent installs a package via `apt` (mocked or safe).
- Agent performs multi-step browser navigation and returns data.
- Verify CDP port 9222 accessibility.

---

## Phase III: Messaging & Linux Service (ETA: 1.0h)

### Objective
Remote access via WhatsApp/Telegram and persistent background operation.

### Implementation Steps
1. **WhatsApp:** `Baileys` integration for remote control.
2. **Telegram:** `grammY` integration for bot access.
3. **Service:** Create `openunum.service` for Systemd.

### E2E Testing
- Verify command execution triggered from a mobile device (Telegram).
- Verify service persistence after reboot.
