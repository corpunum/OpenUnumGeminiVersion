import { ModelProvider, type ChatMessage } from "./providers.ts";
import { MemoryManager } from "./memory.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<string>;
}

interface PlanStep {
  index: number;
  title: string;
  status: "pending" | "done";
}

interface ExecutionPlan {
  objective: string;
  steps: PlanStep[];
  currentStep: number;
  recoveryAttempts: number;
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
  private maxToolResultChars = 5000;
  private globalSuccessCount = 0; // Persistent across the entire session
  private toolFailureCount: Map<string, number> = new Map(); // For Deterministic Pivot
  private activePlan: ExecutionPlan | null = null;
  private maxRecoveryAttempts = 2;
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

  private parsePlanSteps(text: string): PlanStep[] {
    try {
      const parsed = JSON.parse(text) as { steps?: string[] };
      const steps = (parsed.steps ?? [])
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      if (steps.length > 0) {
        return steps.map((title, idx) => ({
          index: idx,
          title,
          status: "pending" as const,
        }));
      }
    } catch {
      // Fallback to line parsing below.
    }

    const lines = text
      .split("\n")
      .map(line => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    return lines.map((title, idx) => ({
      index: idx,
      title,
      status: "pending" as const,
    }));
  }

  private async buildExecutionPlan(objective: string): Promise<ExecutionPlan | null> {
    try {
      const planPrompt = [
        "Return a concise execution plan for this objective.",
        "Output JSON only in this exact format: {\"steps\":[\"step 1\", \"step 2\", ...]}",
        "Use 3-7 steps. No tool calls. No XML/tags.",
      ].join(" ");

      const response = await this.provider.chat([
        { role: "system", content: planPrompt },
        { role: "user", content: objective },
      ]);
      const raw = response?.choices?.[0]?.message?.content ?? "";
      const cleaned = this.cleanAssistantContent(raw);
      const steps = this.parsePlanSteps(cleaned);
      if (steps.length === 0) {
        return null;
      }
      return {
        objective,
        steps,
        currentStep: 0,
        recoveryAttempts: 0,
      };
    } catch {
      return null;
    }
  }

  private getPlanInstruction(): string {
    if (!this.activePlan) return "";
    const planLines = this.activePlan.steps.map((s, idx) => {
      const status = idx < this.activePlan.currentStep || s.status === "done" ? "done" : "pending";
      const marker = idx === this.activePlan.currentStep ? " <- current" : "";
      return `${idx + 1}. [${status}] ${s.title}${marker}`;
    });
    return [
      "PLAN LOCK ACTIVE. Follow this plan exactly and finish it autonomously.",
      `Objective: ${this.activePlan.objective}`,
      ...planLines,
      "Rules: minimize repeated tools; avoid calling same tool+args repeatedly; when enough evidence exists, output final answer.",
    ].join("\n");
  }

  private markPlanProgress(success: boolean) {
    if (!this.activePlan) return;
    if (!success) return;
    if (this.activePlan.currentStep < this.activePlan.steps.length) {
      this.activePlan.steps[this.activePlan.currentStep].status = "done";
      this.activePlan.currentStep++;
    }
  }

  private async trySelfHeal(reason: string): Promise<boolean> {
    if (!this.activePlan) return false;
    if (this.activePlan.recoveryAttempts >= this.maxRecoveryAttempts) return false;
    this.activePlan.recoveryAttempts++;
    this.onStatus?.(`Self-heal ${this.activePlan.recoveryAttempts}/${this.maxRecoveryAttempts}: ${reason}`);
    this.history.push({
      role: "system",
      content: [
        "SELF-HEAL MODE:",
        `Reason: ${reason}`,
        "Change strategy now. Do not repeat previously repeated tool calls.",
        "Prefer a different method and then continue the remaining plan steps.",
      ].join(" "),
    });
    return true;
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

  private capToolResult(text: string): string {
    if (text.length <= this.maxToolResultChars) return text;
    return `${text.slice(0, this.maxToolResultChars)}\n\n[TRUNCATED ${text.length - this.maxToolResultChars} chars]`;
  }

  private summarizeToolResult(toolName: string, text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    const short = compact.slice(0, 600);
    const suffix = compact.length > 600 ? "..." : "";
    return `Last tool (${toolName}) summary: ${short}${suffix}`;
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
    let objectiveForMemory = userMessage ?? "";
    if (userMessage) {
      const sanitizedUserMessage = this.sanitizeSensitive(userMessage);
      objectiveForMemory = sanitizedUserMessage;
      if (sanitizedUserMessage !== userMessage) {
        this.onStatus?.("Sensitive token detected and redacted from memory/history.");
      }

      this.history.push({ role: "user", content: sanitizedUserMessage });
      this.persistMessage(sessionId, "user", sanitizedUserMessage);
      this.history.push({
        role: "system",
        content: "WORKSPACE POLICY: Operate only inside /home/corp-unum/OpenUnumGeminiVersion unless the user explicitly requests another path.",
      });
      const tacticalContext = await this.getTacticalContext(sanitizedUserMessage);
      if (tacticalContext) {
        this.history.push({ role: "system", content: tacticalContext });
      }

      if (this.isPlanningOnlyRequest(sanitizedUserMessage)) {
        this.onStatus?.("Planning-only request detected. Tool execution disabled for this turn.");
        const plan = await this.planningResponse(sanitizedUserMessage);
        if (plan) {
          this.activePlan = null;
          return this.finalizeResponse(plan, sessionId);
        }
      }

      this.activePlan = await this.buildExecutionPlan(sanitizedUserMessage);
      if (this.activePlan) {
        this.onStatus?.(`Autonomous plan created (${this.activePlan.steps.length} steps). Executing...`);
      } else {
        this.onStatus?.("Plan generation failed. Falling back to direct autonomous execution.");
      }
    }

    const startMissionSuccessCount = this.globalSuccessCount; // Fixed PoW logic (Codex Fix)
    let currentRetryCount = 0;
    const toolCallFrequency: Map<string, number> = new Map();
    const toolUsageCount: Map<string, number> = new Map();
    let toolExecutionCount = 0;
    let lastToolSummary = "";
    let providerFailureCount = 0;
    const totalIterationBudget = this.maxIterations + this.maxRecoveryAttempts * 5;

    iterationLoop:
    for (let iteration = 0; iteration < totalIterationBudget; iteration++) {
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

      this.onStatus?.(`Iteration ${iteration + 1}/${totalIterationBudget}...`);

      const loopMessages = this.activePlan
        ? [...this.history, { role: "system", content: this.getPlanInstruction() }]
        : this.history;
      let response: any;
      try {
        response = await this.provider.chat(loopMessages, toolSchemas);
        providerFailureCount = 0;
      } catch (err: any) {
        providerFailureCount++;
        const errMsg = String(err?.message ?? err);
        const transient = errMsg.includes("Provider Error (500)") || errMsg.includes("Provider Error (429)");
        if (transient && providerFailureCount <= 2) {
          this.onStatus?.(`Provider transient error detected (${providerFailureCount}/2). Retrying with recovery strategy...`);
          this.history.push({
            role: "system",
            content: "Provider transient error occurred. Continue safely with a shorter context and avoid unnecessary tool calls.",
          });
          continue;
        }
        if (lastToolSummary) {
          this.onStatus?.("Provider unavailable. Returning best available evidence.");
          this.activePlan = null;
          return this.finalizeResponse(`Provider temporarily unavailable.\n\n${lastToolSummary}`, sessionId);
        }
        this.activePlan = null;
        return this.finalizeResponse("Provider temporarily unavailable after retries. Automatic recovery failed for this turn.", sessionId);
      }
      const assistantMessage = response.choices[0].message;
      const content = assistantMessage.content || "";

      this.history.push(assistantMessage);

      if (assistantMessage.tool_calls) {
        let restartWithHeal = false;
        for (const toolCall of assistantMessage.tool_calls) {
          const callSignature = `${toolCall.function.name}:${toolCall.function.arguments ?? ""}`;
          const signatureCount = (toolCallFrequency.get(callSignature) || 0) + 1;
          toolCallFrequency.set(callSignature, signatureCount);
          const toolNameCount = (toolUsageCount.get(toolCall.function.name) || 0) + 1;
          toolUsageCount.set(toolCall.function.name, toolNameCount);

          if (signatureCount >= 3) {
            const repeatMsg = `REPEAT DETECTED: Tool call "${toolCall.function.name}" repeated ${signatureCount} times with the same arguments. Summarize and provide final answer with current evidence.`;
            this.onStatus?.("Repeated tool loop detected. Forcing final response...");
            this.history.push({ role: "system", content: repeatMsg });
            const forced = await this.forceFinalAnswer("Return a final answer now. Do not call any more tools unless absolutely required.");
            if (forced) {
              this.toolFailureCount.clear();
              return this.finalizeResponse(forced, sessionId);
            }
            if (await this.trySelfHeal(`Repeated tool signature ${toolCall.function.name}`)) {
              toolCallFrequency.clear();
              restartWithHeal = true;
              break;
            }
            continue;
          }

          if (toolNameCount >= 6) {
            if (await this.trySelfHeal(`Tool overuse detected for ${toolCall.function.name}`)) {
              toolCallFrequency.clear();
              restartWithHeal = true;
              break;
            }
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
              content: this.capToolResult(result),
            });
            toolExecutionCount++;
            lastToolSummary = this.summarizeToolResult(tool.name, this.capToolResult(result));
            this.markPlanProgress(success);

            if (this.memory && objectiveForMemory) {
              this.memory.addTactic(objectiveForMemory, tool.name, result, success, success ? "Verified." : "Pivot Enforced.");
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
              if (await this.trySelfHeal("Execution cap reached")) {
                toolExecutionCount = 0;
                toolCallFrequency.clear();
                this.toolFailureCount.clear();
                restartWithHeal = true;
                break;
              }
              this.toolFailureCount.clear();
              return this.finalizeResponse(`Execution cap reached.\n\n${lastToolSummary}`, sessionId);
            }
          }
        }
        if (restartWithHeal) {
          continue iterationLoop;
        }
        if (iteration === totalIterationBudget - 1) {
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
      this.activePlan = null;
      if (cleanedContent.length > 0) {
        return this.finalizeResponse(cleanedContent, sessionId);
      }
      if (lastToolSummary) {
        return this.finalizeResponse(`Completed with tool evidence.\n\n${lastToolSummary}`, sessionId);
      }
      return this.finalizeResponse("Task completed, but the model returned an empty final message.", sessionId);
    }

    this.toolFailureCount.clear();
    this.activePlan = null;
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
