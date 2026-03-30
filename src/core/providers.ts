import { fetch } from "bun";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class ModelProvider {
  private config: {
    provider: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
  };

  constructor(config: {
    provider: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
  }) {
    this.config = config;
  }

  async chat(messages: ChatMessage[], tools?: any[]) {
    // Ensure we are sending a clean messages array without circular refs or extra fields
    const sanitizedMessages = messages.map(m => ({
      role: m.role,
      content: m.content || "",
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));

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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey && this.config.apiKey !== "ollama-local") {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Provider Error (${response.status}): ${error}`);
    }

    return await response.json();
  }
}
