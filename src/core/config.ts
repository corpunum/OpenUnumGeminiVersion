import { type Static, Type } from "@sinclair/typebox";
import { MemoryManager } from "./memory.ts";

export const OpenUnumConfigSchema = Type.Object({
  model: Type.Object({
    provider: Type.Union([
      Type.Literal("ollama"),
      Type.Literal("openrouter"),
      Type.Literal("nvidia"),
      Type.Literal("openai"),
    ]),
    baseUrl: Type.String(),
    apiKey: Type.Optional(Type.String()),
    modelId: Type.String(),
    fallbackModelId: Type.Optional(Type.String()),
    fallbackProvider: Type.Optional(Type.String()),
    providerModels: Type.Optional(Type.Record(Type.String(), Type.String())),
    fallbackOrder: Type.Optional(Type.Array(Type.String())),
    ollamaBaseUrl: Type.Optional(Type.String()),
    nvidiaBaseUrl: Type.Optional(Type.String()),
    openrouterBaseUrl: Type.Optional(Type.String()),
    openaiBaseUrl: Type.Optional(Type.String()),
    ollamaApiKey: Type.Optional(Type.String()),
    nvidiaApiKey: Type.Optional(Type.String()),
    openrouterApiKey: Type.Optional(Type.String()),
    openaiApiKey: Type.Optional(Type.String()),
  }),
  gateways: Type.Object({
    telegram: Type.Object({
      enabled: Type.Boolean(),
      token: Type.Optional(Type.String()),
    }),
    whatsapp: Type.Object({
      enabled: Type.Boolean(),
    }),
  }),
  ui: Type.Object({
    port: Type.Number(),
    host: Type.Optional(Type.String()),
  }),
});

export type OpenUnumConfig = Static<typeof OpenUnumConfigSchema>;

export const DEFAULT_CONFIG: OpenUnumConfig = {
  model: {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    modelId: "ollama/qwen3.5:397b-cloud",
    fallbackModelId: "nvidia/meta/llama-3.1-405b-instruct",
    fallbackProvider: "nvidia",
    providerModels: {
      ollama: "ollama/qwen3.5:397b-cloud",
      nvidia: "nvidia/meta/llama-3.1-405b-instruct",
      openrouter: "openrouter/anthropic/claude-3.5-sonnet",
      openai: "openai/gpt-5.4",
    },
    fallbackOrder: ["ollama", "nvidia", "openrouter", "openai"],
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
    nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    ollamaApiKey: process.env.OLLAMA_API_KEY || "",
    nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
  },
  gateways: {
    telegram: { enabled: false },
    whatsapp: { enabled: false },
  },
  ui: {
    port: Number(process.env.OPENUNUM_GEMINI_PORT || 18884),
    host: process.env.OPENUNUM_GEMINI_HOST || "127.0.0.1",
  },
};

export class ConfigManager {
  private memory: MemoryManager;
  private currentConfig: OpenUnumConfig;

  constructor(memory: MemoryManager) {
    this.memory = memory;
    const saved = this.memory.get("config");
    const parsed = saved ? JSON.parse(saved) as Partial<OpenUnumConfig> : undefined;
    this.currentConfig = this.normalizeConfig(parsed);
    this.memory.set("config", JSON.stringify(this.currentConfig));
  }

  get(): OpenUnumConfig {
    return this.currentConfig;
  }

  set(config: Partial<OpenUnumConfig>) {
    this.currentConfig = this.normalizeConfig({
      ...this.currentConfig,
      ...config,
      model: {
        ...this.currentConfig.model,
        ...(config.model ?? {}),
      },
      gateways: {
        ...this.currentConfig.gateways,
        ...(config.gateways ?? {}),
        telegram: {
          ...this.currentConfig.gateways.telegram,
          ...(config.gateways?.telegram ?? {}),
        },
      },
    });
    this.memory.set("config", JSON.stringify(this.currentConfig));
  }

  private normalizeConfig(partial?: Partial<OpenUnumConfig>): OpenUnumConfig {
    const merged = {
      model: {
        ...DEFAULT_CONFIG.model,
        ...partial?.model,
      },
      gateways: {
        telegram: {
          ...DEFAULT_CONFIG.gateways.telegram,
          ...partial?.gateways?.telegram,
        },
        whatsapp: {
          ...DEFAULT_CONFIG.gateways.whatsapp,
          ...partial?.gateways?.whatsapp,
        },
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...partial?.ui,
      },
    };
    merged.model.provider = String(merged.model.provider || "ollama").toLowerCase() as OpenUnumConfig["model"]["provider"];
    if (merged.model.provider === ("generic" as any)) merged.model.provider = "openai";
    const normalizeModel = (provider: string, model: string | undefined) => {
      const raw = String(model || "").trim();
      if (!raw) return "";
      if (/^(ollama|nvidia|openrouter|openai|generic)\//.test(raw)) return raw.replace(/^generic\//, "openai/");
      return `${provider}/${raw}`;
    };
    merged.model.modelId = normalizeModel(merged.model.provider, merged.model.modelId);
    merged.model.fallbackProvider = String(merged.model.fallbackProvider || "nvidia").toLowerCase();
    merged.model.fallbackModelId = normalizeModel(merged.model.fallbackProvider, merged.model.fallbackModelId || merged.model.providerModels?.[merged.model.fallbackProvider] || "");
    merged.model.providerModels = {
      ...(DEFAULT_CONFIG.model.providerModels || {}),
      ...(merged.model.providerModels || {}),
    };
    merged.model.providerModels.ollama = normalizeModel("ollama", merged.model.providerModels.ollama);
    merged.model.providerModels.nvidia = normalizeModel("nvidia", merged.model.providerModels.nvidia);
    merged.model.providerModels.openrouter = normalizeModel("openrouter", merged.model.providerModels.openrouter);
    merged.model.providerModels.openai = normalizeModel("openai", merged.model.providerModels.openai);
    merged.model.fallbackOrder = Array.isArray(merged.model.fallbackOrder) && merged.model.fallbackOrder.length
      ? merged.model.fallbackOrder.map((p) => p === "generic" ? "openai" : String(p).toLowerCase())
      : ["ollama", "nvidia", "openrouter", "openai"];
    merged.model.baseUrl = (merged.model as any)[`${merged.model.provider}BaseUrl`] || merged.model.baseUrl;
    merged.model.apiKey = (merged.model as any)[`${merged.model.provider}ApiKey`] || merged.model.apiKey;
    const envHost = (process.env.OPENUNUM_GEMINI_HOST || "").trim();
    const envPort = Number(process.env.OPENUNUM_GEMINI_PORT || NaN);
    const hasEnvPort = Number.isFinite(envPort) && envPort > 0;
    const storedPort = Number(merged.ui.port);
    const legacyPort = storedPort === 3000;
    merged.ui.host = envHost || String(merged.ui.host || DEFAULT_CONFIG.ui.host || "127.0.0.1");
    merged.ui.port = hasEnvPort
      ? envPort
      : (legacyPort || !Number.isFinite(storedPort) || storedPort <= 0 ? DEFAULT_CONFIG.ui.port : storedPort);
    return merged;
  }
}
