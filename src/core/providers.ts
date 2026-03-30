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
}

export class ModelProvider {
  private config: ModelProviderConfig;
  private maxMessages = 24;
  private maxMessageChars = 2000;

  constructor(config: ModelProviderConfig) {
    this.config = config;
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

  private compactMessages(messages: ChatMessage[]): ChatMessage[] {
    const truncated = messages.map(m => ({
      role: m.role,
      content: (m.content ?? "").slice(0, this.maxMessageChars),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));

    if (truncated.length <= this.maxMessages) {
      return truncated;
    }

    const firstSystem = truncated.find(m => m.role === "system");
    const tail = truncated.slice(-(this.maxMessages - (firstSystem ? 1 : 0)));
    return firstSystem ? [firstSystem, ...tail] : tail;
  }

  private minimalMessages(messages: ChatMessage[]): ChatMessage[] {
    const firstSystem = messages.find(m => m.role === "system");
    const tail = messages.slice(-6);
    const base = firstSystem ? [firstSystem, ...tail] : tail;
    return base.map(m => ({
      role: m.role,
      content: (m.content ?? "").slice(0, 1200),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));
  }

  async chat(messages: ChatMessage[], tools?: any[]) {
    // Ensure we are sending a clean messages array without circular refs or extra fields
    const sanitizedMessages = this.compactMessages(messages);

    const payload: any = {
      model: this.config.model,
      messages: sanitizedMessages,
      stream: false,
    };

    // Explicitly send tool schemas if provided (Codex Fix)
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

    const maxAttempts = 3;
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      if (!retryable || attempt === maxAttempts) {
        throw new Error(lastError);
      }
      await this.sleep(300 * attempt);
    }

    // Degraded fallback: smaller context and no tools to recover from provider overload.
    try {
      const degradedPayload: any = {
        model: this.config.model,
        messages: this.minimalMessages(sanitizedMessages),
        stream: false,
      };
      const degraded = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(degradedPayload),
      });
      if (degraded.ok) {
        return await degraded.json();
      }
      const degradedErr = await degraded.text();
      lastError = `Provider Error (${degraded.status}): ${degradedErr}`;
    } catch {
      // keep lastError
    }

    throw new Error(lastError || "Provider Error: unknown");
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
