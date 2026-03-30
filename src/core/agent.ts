import { ModelProvider, type ChatMessage } from "./providers.ts";
import { MemoryManager } from "./memory.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<string>;
}

export class OpenUnumAgent {
  private provider: ModelProvider;
  private tools: Map<string, ToolDefinition>;
  private history: ChatMessage[] = [];
  private memory?: MemoryManager;
  private systemPrompt: string;
  private readonly uiSessionId = "ui";
  private maxRetries = 5;
  private maxIterations = 15; // Increased for complex tasks
  private globalSuccessCount = 0; // Persistent across the entire session
  private toolFailureCount: Map<string, number> = new Map(); // For Deterministic Pivot
  public onStatus?: (status: string) => void;

  constructor(provider: ModelProvider, systemPrompt: string, memory?: MemoryManager) {
    this.provider = provider;
    this.memory = memory;
    this.systemPrompt = systemPrompt;
    this.tools = new Map();
    this.history.push({ role: "system", content: systemPrompt });
    this.hydrateUiHistoryFromMemory();
  }

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  updateModelConfig(config: { provider: string; baseUrl: string; apiKey?: string; modelId: string }) {
    this.provider = new ModelProvider({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.modelId,
    });
  }

  private async getTacticalContext(objective: string): Promise<string> {
    if (!this.memory) return "";
    const tactics = this.memory.getTactics(objective);
    if (tactics.length === 0) return "";

    let context = "\n### PROVEN TACTICS & STRATEGY OUTCOMES (AUDIT TRAIL)\n";
    for (const t of tactics) {
      const status = t.success ? "PROVEN SUCCESS" : "FAILED ATTEMPT";
      context += `- [${status}] Strategy: ${t.action} | Outcome: ${t.outcome} | Learning: ${t.learning}\n`;
    }
    context += "\nINSTRUCTION: Favor PROVEN SUCCESS. Avoid FAILED ATTEMPTS. If a tool shows multiple failures, the system will deterministically disable it for the next attempt.\n";
    return context;
  }

  private hydrateUiHistoryFromMemory() {
    if (!this.memory) return;
    const persisted = this.memory.getMessages(this.uiSessionId);
    for (const message of persisted) {
      if (message.role === "user" || message.role === "assistant") {
        this.history.push({ role: message.role, content: message.content });
      }
    }
  }

  private persistMessage(sessionId: string, role: "user" | "assistant", content: string) {
    if (!this.memory) return;
    if (!content.trim()) return;
    this.memory.addMessage(sessionId, role, content);
  }

  private finalizeResponse(text: string, sessionId: string): string {
    this.persistMessage(sessionId, "assistant", text);
    return text;
  }

  getUiHistory(): { role: "user" | "assistant"; content: string }[] {
    if (this.memory) {
      return this.memory
        .getMessages(this.uiSessionId)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    }

    return this.history
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content ?? "" }));
  }

  resetUiHistory() {
    this.history = [{ role: "system", content: this.systemPrompt }];
    if (this.memory) {
      this.memory.clearMessages(this.uiSessionId);
    }
  }

  private async forceFinalAnswer(instruction: string): Promise<string | null> {
    try {
      this.history.push({ role: "system", content: instruction });
      const finalResponse = await this.provider.chat(this.history);
      const finalMessage = finalResponse?.choices?.[0]?.message?.content;
      if (typeof finalMessage === "string" && finalMessage.trim().length > 0) {
        const cleaned = this.cleanAssistantContent(finalMessage);
        if (cleaned.length > 0) {
          this.history.push({ role: "assistant", content: cleaned });
          return cleaned;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private cleanAssistantContent(text: string): string {
    return text
      .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "")
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
      .trim();
  }

  private sanitizeSensitive(text: string): string {
    return text
      .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
      .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]");
  }

  private isPlanningOnlyRequest(text: string): boolean {
    const t = text.toLowerCase();
    const planSignals = [
      "first plan",
      "plan out",
      "give me a plan",
      "just plan",
      "architecture plan",
      "then we continue",
    ];
    return planSignals.some(signal => t.includes(signal));
  }

  private async planningResponse(userText: string): Promise<string | null> {
    this.history.push({
      role: "system",
      content:
        "PLANNING MODE: Return only a concrete implementation plan. Do not call tools. Do not emit tool-call tags/XML.",
    });
    const response = await this.provider.chat([
      ...this.history,
      { role: "user", content: userText },
    ]);
    const content = response?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }
    const cleaned = this.cleanAssistantContent(content);
    if (!cleaned) {
      return null;
    }
    this.history.push({ role: "assistant", content: cleaned });
    return cleaned;
  }

  async step(userMessage?: string, sessionId = this.uiSessionId): Promise<string> {
    if (userMessage) {
      const sanitizedUserMessage = this.sanitizeSensitive(userMessage);
      if (sanitizedUserMessage !== userMessage) {
        this.onStatus?.("Sensitive token detected and redacted from memory/history.");
      }

      this.history.push({ role: "user", content: sanitizedUserMessage });
      this.persistMessage(sessionId, "user", sanitizedUserMessage);
      const tacticalContext = await this.getTacticalContext(sanitizedUserMessage);
      if (tacticalContext) {
        this.history.push({ role: "system", content: tacticalContext });
      }

      if (this.isPlanningOnlyRequest(sanitizedUserMessage)) {
        this.onStatus?.("Planning-only request detected. Tool execution disabled for this turn.");
        const plan = await this.planningResponse(sanitizedUserMessage);
        if (plan) {
          return this.finalizeResponse(plan, sessionId);
        }
      }
    }

    const startMissionSuccessCount = this.globalSuccessCount; // Fixed PoW logic (Codex Fix)
    let currentRetryCount = 0;
    const toolCallFrequency: Map<string, number> = new Map();
    let toolExecutionCount = 0;
    let lastToolSummary = "";

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Deterministic Pivot: Filter out tools that have failed too many times in this mission
      const availableTools = Array.from(this.tools.values()).filter(t => {
        const fails = this.toolFailureCount.get(t.name) || 0;
        return fails < 2; // Deterministic Policy: Fail twice, disable for this mission (Codex Fix)
      });

      const toolSchemas = availableTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      this.onStatus?.(`Iteration ${iteration + 1}/${this.maxIterations}...`);

      const response = await this.provider.chat(this.history, toolSchemas);
      const assistantMessage = response.choices[0].message;
      const content = assistantMessage.content || "";

      this.history.push(assistantMessage);

      if (assistantMessage.tool_calls) {
        for (const toolCall of assistantMessage.tool_calls) {
          const callSignature = `${toolCall.function.name}:${toolCall.function.arguments ?? ""}`;
          const signatureCount = (toolCallFrequency.get(callSignature) || 0) + 1;
          toolCallFrequency.set(callSignature, signatureCount);

          if (signatureCount >= 3) {
            const repeatMsg = `REPEAT DETECTED: Tool call "${toolCall.function.name}" repeated ${signatureCount} times with the same arguments. Summarize and provide final answer with current evidence.`;
            this.onStatus?.("Repeated tool loop detected. Forcing final response...");
            this.history.push({ role: "system", content: repeatMsg });
            const forced = await this.forceFinalAnswer("Return a final answer now. Do not call any more tools unless absolutely required.");
            if (forced) {
              this.toolFailureCount.clear();
              return this.finalizeResponse(forced, sessionId);
            }
            continue;
          }

          const tool = this.tools.get(toolCall.function.name);
          if (tool) {
            let args: any = {};
            try {
              args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch {
              args = {};
            }
            this.onStatus?.(`Executing: ${tool.name}`);
            
            let result: string;
            let success = true;

            try {
              result = await tool.execute(args);
              if (result.toLowerCase().includes("error") || result.toLowerCase().includes("timeout") || result.toLowerCase().includes("failed")) {
                success = false;
                this.toolFailureCount.set(tool.name, (this.toolFailureCount.get(tool.name) || 0) + 1);
              } else {
                this.globalSuccessCount++;
              }
            } catch (err: any) {
              result = `CRITICAL ERROR: ${err.message}`;
              success = false;
              this.toolFailureCount.set(tool.name, (this.toolFailureCount.get(tool.name) || 0) + 1);
            }

            this.history.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
            toolExecutionCount++;
            lastToolSummary = `Last tool (${tool.name}) output:\n${result}`;

            if (this.memory && userMessage) {
              this.memory.addTactic(userMessage, tool.name, result, success, success ? "Verified." : "Pivot Enforced.");
            }

            if (!success && currentRetryCount < this.maxRetries) {
              currentRetryCount++;
              this.onStatus?.(`Strategy failed. Pivot in progress...`);
            }

            if (toolExecutionCount >= 8) {
              this.onStatus?.("Tool execution cap reached. Forcing final response...");
              const forced = await this.forceFinalAnswer("Stop calling tools. Return a direct final answer now based on the gathered evidence.");
              if (forced) {
                this.toolFailureCount.clear();
                return this.finalizeResponse(forced, sessionId);
              }
              this.toolFailureCount.clear();
              return this.finalizeResponse(`Execution cap reached.\n\n${lastToolSummary}`, sessionId);
            }
          }
        }
        if (iteration === this.maxIterations - 1) {
          const forced = await this.forceFinalAnswer("You are at the maximum iteration limit. Return the best final answer now using existing tool outputs. Do not output XML tags.");
          if (forced) {
            this.toolFailureCount.clear();
            return this.finalizeResponse(forced, sessionId);
          }
          if (lastToolSummary) {
            this.toolFailureCount.clear();
            return this.finalizeResponse(`Iteration limit reached.\n\n${lastToolSummary}`, sessionId);
          }
        }
        continue;
      }

      if (/<minimax:tool_call>|<invoke/i.test(content)) {
        const forced = await this.forceFinalAnswer("Do not output tool-call XML. Return plain text final answer only.");
        if (forced) {
          this.toolFailureCount.clear();
          return this.finalizeResponse(forced, sessionId);
        }
      }

      // Final Proof-of-Work check against the entire mission start count (Codex Fix)
      const hasNewProof = this.globalSuccessCount > startMissionSuccessCount;
      const cleanedContent = this.cleanAssistantContent(content);
      const isDone = cleanedContent.toUpperCase().includes("DONE") || cleanedContent.toUpperCase().includes("FINISH");

      if (isDone && !hasNewProof && currentRetryCount < this.maxRetries) {
          currentRetryCount++;
          const msg = "PoW ERROR: You claimed completion without evidence. Re-executing with deterministic CLI fallback.";
          this.onStatus?.(msg);
          this.history.push({ role: "system", content: msg });
          continue;
      }

      this.toolFailureCount.clear(); // Reset for next user command
      if (cleanedContent.length > 0) {
        return this.finalizeResponse(cleanedContent, sessionId);
      }
      if (lastToolSummary) {
        return this.finalizeResponse(`Completed with tool evidence.\n\n${lastToolSummary}`, sessionId);
      }
      return this.finalizeResponse("Task completed, but the model returned an empty final message.", sessionId);
    }

    this.toolFailureCount.clear();
    const forced = await this.forceFinalAnswer("Mission reached loop limit. Return a concise final answer now from available evidence.");
    if (forced) {
      return this.finalizeResponse(forced, sessionId);
    }
    return this.finalizeResponse("Mission timed out after maximum iterations. Partial success recorded.", sessionId);
  }

  getHistory() {
    return this.history;
  }
}
