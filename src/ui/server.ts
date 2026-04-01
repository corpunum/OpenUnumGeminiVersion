import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigManager } from "../core/config.ts";
import { OpenUnumAgent } from "../core/agent.ts";
import { buildModelCatalog, buildLegacyProviderModels, normalizeProviderId, PROVIDER_ORDER } from "../core/model-catalog.ts";
import { getCapabilities } from "../core/capabilities.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");

type Mission = {
  id: string;
  goal: string;
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
};

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function normalizeModelForProvider(provider: string, model: string) {
  const p = normalizeProviderId(provider);
  const raw = String(model || "").trim();
  if (!raw) return "";
  if (/^(ollama|nvidia|openrouter|openai|generic)\//.test(raw)) return raw.replace(/^generic\//, "openai/");
  return `${p}/${raw}`;
}

function emitEvent(clients: Set<ServerWebSocket<unknown>>, event: any) {
  const msg = JSON.stringify({ type: "event", event });
  for (const ws of clients) {
    try { ws.send(msg); } catch {}
  }
}

export function startUiServer(configManager: ConfigManager, agent: OpenUnumAgent) {
  const missions = new Map<string, Mission>();
  const wsClients = new Set<ServerWebSocket<unknown>>();
  const ui = configManager.get().ui;
  const host = ui.host || "127.0.0.1";
  const port = ui.port;

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        if (server.upgrade(req)) return;
        return new Response("Upgrade failed", { status: 400 });
      }

      if (url.pathname === "/api/health" && req.method === "GET") {
        const cfg = configManager.get();
        return json({
          status: "ok",
          app: "OpenUnumGeminiVersion",
          host: cfg.ui.host || "127.0.0.1",
          port: cfg.ui.port,
          provider: cfg.model.provider,
          model: cfg.model.modelId,
          healthy: true,
          provider_order: [...PROVIDER_ORDER],
          runtime: {
            autonomy_mode: "autonomy-first",
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (url.pathname === "/api/capabilities" && req.method === "GET") {
        return json(getCapabilities(configManager.get()));
      }

      if (url.pathname === "/api/model-catalog" && req.method === "GET") {
        const catalog = await buildModelCatalog(configManager.get());
        return json(catalog);
      }

      if (url.pathname === "/api/models" && req.method === "GET") {
        const cfg = configManager.get();
        const provider = normalizeProviderId(url.searchParams.get("provider") || cfg.model.provider);
        const models = await buildLegacyProviderModels(cfg, provider);
        return json({ provider, models });
      }

      if (url.pathname === "/api/config" && req.method === "GET") {
        const cfg = configManager.get();
        const catalog = await buildModelCatalog(cfg);
        return json({
          app_id: "openunum-gemini",
          providerConfig: {
            provider: cfg.model.provider,
            model: cfg.model.modelId,
            fallbackProvider: cfg.model.fallbackProvider,
            fallbackModel: cfg.model.fallbackModelId,
            providerModels: cfg.model.providerModels,
            fallbackOrder: cfg.model.fallbackOrder,
            autonomyMode: "autonomy-first",
          },
          modelCatalog: catalog,
          capabilities: getCapabilities(cfg),
        });
      }

      if ((url.pathname === "/api/config") && (req.method === "POST" || req.method === "PUT")) {
        const body = await req.json() as any;
        const cfg = configManager.get();
        const provider = normalizeProviderId(body?.providerConfig?.provider || cfg.model.provider);
        const model = normalizeModelForProvider(provider, body?.providerConfig?.model || cfg.model.modelId);
        const fallbackModelRaw = String(body?.providerConfig?.fallbackModel || cfg.model.fallbackModelId || "").trim();
        const fallbackProvider = normalizeProviderId(body?.providerConfig?.fallbackProvider || fallbackModelRaw.split("/")[0] || cfg.model.fallbackProvider || "nvidia");
        const fallbackModel = normalizeModelForProvider(fallbackProvider, fallbackModelRaw || cfg.model.providerModels?.[fallbackProvider]);

        const providerModels = {
          ...(cfg.model.providerModels || {}),
          ...(body?.providerConfig?.providerModels || {}),
          [provider]: model,
          [fallbackProvider]: fallbackModel,
        };

        const nextModel = {
          ...cfg.model,
          provider,
          modelId: model,
          fallbackProvider,
          fallbackModelId: fallbackModel,
          providerModels,
          fallbackOrder: [...PROVIDER_ORDER],
        };

        configManager.set({ model: nextModel, ui: { ...cfg.ui, host, port } as any });
        const active = configManager.get();
        agent.updateModelConfig(active.model as any);
        emitEvent(wsClients, { type: "health.updated", ts: new Date().toISOString(), payload: { provider, model } });

        return json({ ok: true, providerConfig: {
          provider: active.model.provider,
          model: active.model.modelId,
          fallbackProvider: active.model.fallbackProvider,
          fallbackModel: active.model.fallbackModelId,
          providerModels: active.model.providerModels,
          fallbackOrder: active.model.fallbackOrder,
          autonomyMode: "autonomy-first",
        } });
      }

      if (url.pathname === "/api/events" && req.method === "GET") {
        return json({ events: [] });
      }

      if (url.pathname === "/api/missions" && req.method === "GET") {
        return json({ missions: [...missions.values()] });
      }

      if (url.pathname === "/api/missions/start" && req.method === "POST") {
        const body = await req.json() as any;
        const id = `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const mission: Mission = {
          id,
          goal: String(body?.goal || "").trim(),
          status: "running",
          sessionId: `mission:${id}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        missions.set(id, mission);
        emitEvent(wsClients, { type: "mission.updated", ts: new Date().toISOString(), payload: { mission } });

        try {
          const result = await agent.step(`Mission goal: ${mission.goal}`, mission.sessionId);
          mission.status = "completed";
          mission.result = result;
        } catch (error: any) {
          mission.status = "failed";
          mission.error = String(error?.message || error);
        }
        mission.updatedAt = new Date().toISOString();
        emitEvent(wsClients, { type: "mission.updated", ts: new Date().toISOString(), payload: { mission } });
        return json({ ok: true, mission });
      }

      if (url.pathname === "/api/missions/status" && req.method === "GET") {
        const id = String(url.searchParams.get("id") || "").trim();
        const mission = missions.get(id);
        if (!mission) return json({ ok: false, error: "mission_not_found" }, 404);
        return json({ ok: true, mission });
      }

      if (url.pathname === "/api/missions/stop" && req.method === "POST") {
        const body = await req.json() as any;
        const id = String(body?.id || "").trim();
        const mission = missions.get(id);
        if (!mission) return json({ ok: false, error: "mission_not_found" }, 404);
        mission.status = "stopped";
        mission.updatedAt = new Date().toISOString();
        emitEvent(wsClients, { type: "mission.updated", ts: new Date().toISOString(), payload: { mission } });
        return json({ ok: true, mission });
      }

      if (url.pathname === "/api/sessions" && req.method === "GET") {
        const sessions = agent.memory ? agent.memory.getSessions() : [];
        return json({ sessions: sessions.map((s: any) => ({ id: s.session_id, title: s.title, messageCount: Number(s.message_count || 0), updatedAt: s.updated_at })) });
      }

      if (url.pathname === "/api/sessions" && req.method === "POST") {
        const id = `session_${Date.now()}`;
        if (agent.memory) agent.memory.createSession(id, "New Chat");
        return json({ session: { id, title: "New Chat", messageCount: 0 } });
      }

      if (url.pathname.match(/^\/api\/sessions\/[^/]+$/) && req.method === "GET") {
        const id = url.pathname.split("/").pop()!;
        const messages = agent.memory ? agent.memory.getMessages(id) : [];
        return json({ session: { id, messages: messages.map((m: any) => ({ role: m.role, content: m.content, timestamp: m.timestamp })) } });
      }

      if (url.pathname.match(/^\/api\/sessions\/[^/]+$/) && req.method === "DELETE") {
        return json({ deleted: true });
      }

      if (url.pathname === "/api/chat" && req.method === "POST") {
        const body = await req.json() as any;
        const sessionId = String(body?.sessionId || "ui");
        const text = String(body?.message || body?.text || "").trim();
        if (!text) return json({ ok: false, error: "message_required" }, 400);
        emitEvent(wsClients, { type: "chat.started", ts: new Date().toISOString(), payload: { sessionId } });
        try {
          const reply = await agent.step(text, sessionId);
          emitEvent(wsClients, { type: "chat.completed", ts: new Date().toISOString(), payload: { sessionId } });
          return json({ sessionId, response: reply, reply, answer: reply });
        } catch (error: any) {
          const reply = `Provider execution failed: ${String(error?.message || error)}`;
          emitEvent(wsClients, { type: "chat.error", ts: new Date().toISOString(), payload: { sessionId, error: reply } });
          return json({ sessionId, response: reply, reply, answer: reply, completed: false });
        }
      }

      if (url.pathname === "/") {
        const htmlPath = join(PUBLIC_DIR, "index.html");
        const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf-8") : "<html><body>UI missing</body></html>";
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }

      return new Response("Not Found", { status: 404 });
    },

    websocket: {
      open(ws) {
        wsClients.add(ws);
        ws.send(JSON.stringify({ type: "hello", app: "OpenUnumGeminiVersion", ts: new Date().toISOString() }));
      },
      close(ws) {
        wsClients.delete(ws);
      },
      async message(ws, message) {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "chat") {
            const sessionId = String(data.sessionId || "ui");
            const text = String(data.message || data.text || "").trim();
            const reply = await agent.step(text, sessionId);
            ws.send(JSON.stringify({ type: "response", sessionId, response: reply, answer: reply }));
          }
        } catch (err: any) {
          ws.send(JSON.stringify({ type: "error", text: String(err?.message || err) }));
        }
      },
    },
  });

  console.log(`UI Server running at http://${host}:${port}`);
  return server;
}
