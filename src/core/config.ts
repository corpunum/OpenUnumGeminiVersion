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
  }),
});

export type OpenUnumConfig = Static<typeof OpenUnumConfigSchema>;

export const DEFAULT_CONFIG: OpenUnumConfig = {
  model: {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    modelId: "qwen3.5:9b-64k",
    fallbackModelId: "",
  },
  gateways: {
    telegram: { enabled: false },
    whatsapp: { enabled: false },
  },
  ui: {
    port: 3000,
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
        whatsapp: {
          ...this.currentConfig.gateways.whatsapp,
          ...(config.gateways?.whatsapp ?? {}),
        },
      },
      ui: {
        ...this.currentConfig.ui,
        ...(config.ui ?? {}),
      },
    });
    this.memory.set("config", JSON.stringify(this.currentConfig));
  }

  private normalizeConfig(config?: Partial<OpenUnumConfig>): OpenUnumConfig {
    return {
      ...DEFAULT_CONFIG,
      ...(config ?? {}),
      model: {
        ...DEFAULT_CONFIG.model,
        ...(config?.model ?? {}),
      },
      gateways: {
        ...DEFAULT_CONFIG.gateways,
        ...(config?.gateways ?? {}),
        telegram: {
          ...DEFAULT_CONFIG.gateways.telegram,
          ...(config?.gateways?.telegram ?? {}),
        },
        whatsapp: {
          ...DEFAULT_CONFIG.gateways.whatsapp,
          ...(config?.gateways?.whatsapp ?? {}),
        },
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...(config?.ui ?? {}),
      },
    };
  }
}
