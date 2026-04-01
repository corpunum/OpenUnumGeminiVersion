import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

const HOST = "127.0.0.1";
const PORT = 18985;
const BASE_URL = `http://${HOST}:${PORT}`;
const APP_HOME = `/tmp/openunum-gemini-webui-e2e-${Date.now()}`;
let proc: Bun.Subprocess | null = null;

async function waitForServer(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error("server_start_timeout");
}

beforeAll(async () => {
  proc = Bun.spawn({
    cmd: ["bun", "run", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPENUNUM_GEMINI_HOST: HOST,
      OPENUNUM_GEMINI_PORT: String(PORT),
      OPENUNUM_GEMINI_HOME: APP_HOME,
    },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForServer();
});

afterAll(async () => {
  try {
    proc?.kill();
    await proc?.exited;
  } catch {}
  rmSync(APP_HOME, { recursive: true, force: true });
});

describe("OpenUnumGemini: Phase 2 (WebUI Contract)", () => {
  test("GET / serves standardized shell", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.includes('data-testid="provider-select"')).toBe(true);
    expect(html.includes('data-testid="model-select"')).toBe(true);
    expect(html.includes('data-testid="fallback-model-select"')).toBe(true);
    expect(html.includes('data-testid="message-stream"')).toBe(true);
    expect(html.includes('data-testid="composer-input"')).toBe(true);
    expect(html.includes('data-testid="send-message"')).toBe(true);
    expect(html.includes('data-testid="status-bar"')).toBe(true);
  });

  test("GET /api/config exposes providerConfig + capabilities + modelCatalog", async () => {
    const res = await fetch(`${BASE_URL}/api/config`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.app_id).toBe("openunum-gemini");
    expect(body.providerConfig.autonomyMode).toBe("autonomy-first");
    expect(body.modelCatalog.provider_order).toEqual(["ollama", "nvidia", "openrouter", "openai"]);
    expect(body.capabilities.contract_version).toBe("2026-04-01.webui-capabilities.v1");
    expect(body.capabilities.features.chat).toBe(true);
  });
});
