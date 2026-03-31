export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ModelProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  fallbackModel?: string;
}

export class ModelProvider {
  private config: ModelProviderConfig;

  constructor(config: ModelProviderConfig) {
    this.config = config;
  }

  getContextLimit(): number {
    const model = this.config.model.toLowerCase();
    
    // Ollama defaults
    if (this.config.provider === "ollama") {
      if (model.includes("qwen") && model.includes("9b")) return 65536;
      if (model.includes("qwen") && model.includes("32b")) return 32768;
      if (model.includes("llama-3")) return 8192;
      return 4096; // Standard baseline for local models
    }

    // OpenAI/OpenRouter defaults
    if (model.includes("gpt-4o")) return 128000;
    if (model.includes("gpt-4")) return 8192;
    if (model.includes("claude-3")) return 200000;
    if (model.includes("gemini")) return 1000000;
    
    return 4096; // Conservative fallback
  }

  /**
   * Simple character-based token estimation (4 chars ~= 1 token)
   */
  estimateTokenCount(messages: ChatMessage[]): number {
    let charCount = 0;
    for (const m of messages) {
      charCount += (m.role?.length ?? 0);
      charCount += (m.content?.length ?? 0);
      if (m.tool_calls) {
        charCount += JSON.stringify(m.tool_calls).length;
      }
    }
    return Math.ceil(charCount / 4);
  }

  updateConfig(config: Partial<ModelProviderConfig>) {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey && this.config.apiKey !== "ollama-local") {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private async sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendChatRequest(
    model: string,
    messages: ChatMessage[],
    tools?: any[],
    attempts = 2,
  ): Promise<any> {
    const payload: any = {
      model,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      payload.tool_choice = "auto";
    }

    let lastError = "";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        return await response.json();
      }
      const error = await response.text();
      lastError = `Provider Error (${response.status}): ${error}`;
      const retryable = response.status >= 500 || response.status === 429;
      if (!retryable || attempt === attempts) {
        break;
      }
      await this.sleep(300 * attempt);
    }
    throw new Error(lastError || "Provider Error: unknown");
  }

  async chat(messages: ChatMessage[], tools?: any[]) {
    let lastError = "";
    try {
      return await this.sendChatRequest(this.config.model, messages, tools, 3);
    } catch (err: any) {
      lastError = String(err?.message ?? err);
    }

    // Degraded fallback: minimal context to recover
    try {
      return await this.sendChatRequest(this.config.model, messages.slice(-5), undefined, 1);
    } catch {
      // Continue to model failover below.
    }

    for (const fallbackModel of this.candidateFallbackModels()) {
      try {
        return await this.sendChatRequest(fallbackModel, messages, tools, 1);
      } catch (err: any) {
        lastError = String(err?.message ?? err);
      }

      try {
        return await this.sendChatRequest(fallbackModel, messages.slice(-5), undefined, 1);
      } catch (err: any) {
        lastError = String(err?.message ?? err);
      }
    }

    throw new Error(lastError || "Provider Error: unknown");
  }

  private candidateFallbackModels(): string[] {
    const provider = this.config.provider;
    const current = this.config.model;
    const configuredFallback = this.config.fallbackModel?.trim();

    const defaults: Record<string, string[]> = {
      ollama: [
        "qwen3.5:397b-cloud",
        "kimi-k2.5:cloud",
        "glm-5:cloud",
        "qwen3.5:9b-64k",
        "uncensored:latest",
      ],
      nvidia: [
        "meta/llama-3.3-70b-instruct",
        "mistralai/mistral-large",
        "qwen/qwen3.5-122b-a10b",
      ],
      openrouter: [
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
      ],
      openai: [
        "gpt-4o-mini",
        "gpt-4.1-mini",
      ],
    };

    const candidates = [...(defaults[provider] ?? [])];
    if (configuredFallback && configuredFallback !== current) {
      candidates.unshift(configuredFallback);
    }
    return Array.from(new Set(candidates)).filter(m => m !== current);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return [];
      }

      const json = await response.json() as { data?: { id?: string }[] };
      const modelIds = json.data?.map(item => item.id).filter(Boolean) as string[] | undefined;
      return modelIds ?? [];
    } catch {
      return [];
    }
  }
}
