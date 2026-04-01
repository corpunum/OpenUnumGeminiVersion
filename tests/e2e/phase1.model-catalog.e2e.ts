import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

const HOST = "127.0.0.1";
const PORT = 18984;
const BASE_URL = `http://${HOST}:${PORT}`;
const APP_HOME = `/tmp/openunum-gemini-e2e-${Date.now()}`;
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

describe("OpenUnumGemini: Phase 1 (Model Catalog Contract)", () => {
  test("GET /api/model-catalog exposes canonical contract", async () => {
    const res = await fetch(`${BASE_URL}/api/model-catalog`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.contract_version).toBe("2026-04-01.model-catalog.v1");
    expect(body.provider_order).toEqual(["ollama", "nvidia", "openrouter", "openai"]);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBe(4);

    for (const provider of body.providers) {
      expect(typeof provider.provider).toBe("string");
      expect(Array.isArray(provider.models)).toBe(true);
      expect(provider.models.length).toBeGreaterThan(0);
      const top = provider.models[0];
      expect(top.rank).toBe(1);
      expect(typeof top.capability_score).toBe("number");
    }
  });

  test("GET /api/models compatibility uses same provider IDs", async () => {
    const res = await fetch(`${BASE_URL}/api/models?provider=openai`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.provider).toBe("openai");
    expect(Array.isArray(body.models)).toBe(true);
  });
});
