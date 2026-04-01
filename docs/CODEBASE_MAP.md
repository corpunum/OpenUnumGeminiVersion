# OpenUnum: Codebase Map

This document provides a structural map of the project for efficient navigation.

## /src/ (Source Code)
- **core/**
    - `agent.ts`: The central autonomous brain and tool dispatcher.
    - `memory.ts`: SQLite interaction for chat history and tactics.
    - `ghost.ts`: Background monitor for loop detection and strategy injection.
    - `health.ts`: Self-healing logic and system status monitoring.
    - `providers.ts`: LLM provider interfaces (Ollama, OpenAI, etc.).
- **tools/**
    - `exec.ts`: Terminal command execution.
    - `files.ts`: File system operations.
    - `browser.ts`: Web automation via Playwright.
    - `skills.ts`: Skill management and execution.
    - `email.ts`: Google CLI email communication.
- **ui/**
    - `server.ts`: Bun-based HTTP/WebSocket server for the Control Center.
- `index.ts`: Application entry point.

## /docs/ (Documentation)
- `AGENT_ONBOARDING.md`: Core principles and operational guide for LLMs.
- `CODEBASE_MAP.md`: This file.

## /scripts/ (Utility & Automation)
- `research_daily.ts`: Autonomous research agent for new methods.
- `git_sync.ts`: Automatic version control for all agent actions.

## /tests/ (Verification)
- `e2e/`: Full end-to-end mission tests (Phases 0-7).

## /root (Project Root)
- `GEMINI.md`: High-level project philosophy and mandates.
- `~/.openunum-gemini/openunum.db`: The persistent memory and tactical ledger.
- `openunum-gemini.service`: Systemd user service for background execution.
- `install.sh`: One-line setup and update script.
