import { ModelProvider, type ChatMessage } from "./providers.ts";
import { MemoryManager } from "./memory.ts";
import { GitSync } from "./git_sync.ts";
import { HistoryCompactor } from "./compactor.ts";

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
  public memory?: MemoryManager;
  private gitSync: GitSync;
  private compactor: HistoryCompactor;
  private systemPrompt: string;
  private readonly uiSessionId = "ui";
  private maxRetries = 5;
  private maxIterations = 50;
  private maxToolResultChars = 5000;
  private globalSuccessCount = 0;
  private toolFailureCount: Map<string, number> = new Map();
  private activePlan: ExecutionPlan | null = null;
  private maxRecoveryAttempts = 2;
  public onStatus?: (status: string) => void;

  constructor(provider: ModelProvider, systemPrompt: string, memory?: MemoryManager) {
    this.provider = provider;
    this.memory = memory;
    this.gitSync = new GitSync();
    this.compactor = new HistoryCompactor(provider);
    this.systemPrompt = systemPrompt;
    this.tools = new Map();
    this.history.push({ role: "system", content: systemPrompt });
    this.hydrateUiHistoryFromMemory();
  }

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  updateModelConfig(config: { provider: string; baseUrl: string; apiKey?: string; modelId: string; fallbackModelId?: string }) {
    this.provider = new ModelProvider({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.modelId,
      fallbackModel: config.fallbackModelId,
    });
  }

  public getHistoryForSession(sessionId: string): { role: "user" | "assistant"; content: string }[] {
    if (!this.memory) return [];
    const messages = this.memory.getMessages(sessionId);
    return messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
      .reverse();
  }

  private async getTacticalContext(objective: string): Promise<string> {
    if (!this.memory) return "";
    const tactics = this.memory.getSimilarTactics(objective);
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
      // Fallback to line parsing
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
        this.history.push({ role: message.role as any, content: message.content });
      }
    }
  }

  private persistMessage(sessionId: string, role: "user" | "assistant", content: string) {
    if (!this.memory) return;
    if (!content.trim()) return;
    this.memory.addMessage(sessionId, role, content);
  }

  private async finalizeResponse(text: string, sessionId: string): Promise<string> {
    this.persistMessage(sessionId, "assistant", text);
    await this.gitSync.sync(`Mission: ${this.activePlan?.objective || "Direct action completed"}`);
    return text;
  }

  getUiHistory(): { role: "user" | "assistant"; content: string }[] {
    return this.getHistoryForSession(this.uiSessionId);
  }

  resetUiHistory() {
    this.history = [{ role: "system", content: this.systemPrompt }];
    if (this.memory) {
      // In new multi-session model, we don't clear history, we start a new session
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

  private resolveToolName(name: string): string {
    const n = name.toLowerCase();
    if (n === "shell" || n === "terminal" || n === "exec" || n === "bash" || n === "sh") return "run_command";
    if (n === "file" || n === "files" || n === "cat") return "file_read";
    if (n === "write") return "file_write";
    if (n === "browser" || n === "web" || n === "chrome") return "browser_navigate";
    return name;
  }

  private parseFlagStyleParameters(text: string): any {
    const params: any = {};
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("--"));
    for (const line of lines) {
      const match = line.match(/^--([a-zA-Z0-9]+)\s+(.*)$/);
      if (match) {
        const key = match[1].toLowerCase();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        params[key] = value;
      }
    }
    return params;
  }

  private async parseAndExecuteXmlToolCalls(content: string, toolCallFrequency: Map<string, number>, toolUsageCount: Map<string, number>, sessionId: string, objectiveForMemory: string, startMissionSuccessCount: number): Promise<{ success: boolean; result?: string; restartWithHeal: boolean }> {
    const results: { success: boolean; result?: string; restartWithHeal: boolean }[] = [];
    const toolCallRegex = /(?:\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]|<(tool_call|invoke)([^>]*)>([\s\S]*?)<\/\2>)/gi;
    
    let match;
    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        let toolName: string | undefined;
        let toolArgs: any = {};
        
        if (match[1]) {
          const rawContent = match[1].trim();
          if (rawContent.startsWith("{")) {
            const cleanedContent = rawContent.replace(/=>/g, ":");
            const nameMatch = cleanedContent.match(/tool\s*:\s*["']([^"']+)["']/);
            if (nameMatch) toolName = nameMatch[1];
            const argsMatch = cleanedContent.match(/args\s*:\s*\{([\s\S]*)\}/);
            if (argsMatch) {
              const argsText = argsMatch[1].trim();
              if (argsText.includes("--")) {
                toolArgs = this.parseFlagStyleParameters(argsText);
              } else {
                try { toolArgs = JSON.parse("{" + argsText + "}"); } catch { toolArgs = {}; }
              }
            }
          }
        } else if (match[4]) {
          const tagAttributes = match[3] || "";
          const tagContent = match[4].trim();
          if (tagContent.startsWith("{")) {
            try {
              const toolCall = JSON.parse(tagContent.replace(/=>/g, ":"));
              toolName = toolCall.name || toolCall.function?.name;
              toolArgs = toolCall.parameters || toolCall.arguments || toolCall.function?.arguments || {};
            } catch {}
          }
          if (!toolName) {
            const nameMatch = tagAttributes.match(/name=["']([^"']+)["']/);
            if (nameMatch) toolName = nameMatch[1];
            const paramRegex = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi;
            let pMatch;
            while ((pMatch = paramRegex.exec(tagContent)) !== null) {
              toolArgs[pMatch[1]] = pMatch[2].trim();
            }
          }
        }

        if (!toolName && toolArgs.command) toolName = "run_command";

        if (toolName) {
          toolName = this.resolveToolName(toolName);
          const tool = this.tools.get(toolName);
          if (tool) {
            this.onStatus?.(`Executing (Tactical): ${tool.name}`);
            let result: string;
            let success = true;
            try {
              result = await tool.execute(toolArgs);
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
            this.history.push({ role: "tool", tool_call_id: `tactical_${Date.now()}_${Math.random()}`, content: this.capToolResult(result) });
            if (this.memory && objectiveForMemory) {
              this.memory.addTactic(objectiveForMemory, tool.name, result, success, success ? "Verified via Tactical Call." : "Pivot Enforced.");
            }
            results.push({ success: true, result, restartWithHeal: false });
          }
        }
      } catch (e) {
        console.error("[Agent] Failed to parse tactical tool call:", e);
      }
    }

    if (results.length > 0) {
      const lastResult = results[results.length - 1];
      return { success: true, result: lastResult.result, restartWithHeal: false };
    }
    return { success: false, restartWithHeal: false };
  }

  private cleanAssistantContent(text: string): string {
    return text
      .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "")
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, "")
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
    const planSignals = ["first plan", "plan out", "give me a plan", "just plan", "architecture plan", "then we continue", "take ownership", "autonomous", "autonomsly", "roadmap", "design first"];
    return planSignals.some(signal => t.includes(signal));
  }

  private async planningResponse(userText: string): Promise<string | null> {
    this.history.push({ role: "system", content: "PLANNING MODE: Return only a concrete implementation plan. Do not call tools. Do not emit tool-call tags/XML." });
    const response = await this.provider.chat([...this.history, { role: "user", content: userText }]);
    const content = response?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    const cleaned = this.cleanAssistantContent(content);
    if (!cleaned) return null;
    this.history.push({ role: "assistant", content: cleaned });
    return cleaned;
  }

  async step(userMessage?: string, sessionId = this.uiSessionId): Promise<string> {
    const limit = this.provider.getContextLimit();
    const currentTokens = this.provider.estimateTokenCount(this.history);
    if (currentTokens > limit * 0.75) {
      this.onStatus?.(`Context at ${currentTokens} tokens (75% of ${limit}). Compacting...`);
      this.history = await this.compactor.compact(this.history, limit * 0.25);
    }

    let objectiveForMemory = userMessage ?? "";
    if (userMessage) {
      if (this.memory && sessionId !== "ui") {
        const history = this.memory.getMessages(sessionId, 2);
        if (history.length <= 1) {
          const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? "..." : "");
          this.memory.updateSessionTitle(sessionId, title);
        }
      }

      const sanitizedUserMessage = this.sanitizeSensitive(userMessage);
      objectiveForMemory = sanitizedUserMessage;
      this.history.push({ role: "user", content: sanitizedUserMessage });
      this.persistMessage(sessionId, "user", sanitizedUserMessage);
      this.history.push({ role: "system", content: "WORKSPACE POLICY: Operate only inside /home/corp-unum/OpenUnumGeminiVersion unless the user explicitly requests another path." });
      
      const tacticalContext = await this.getTacticalContext(sanitizedUserMessage);
      if (tacticalContext) this.history.push({ role: "system", content: tacticalContext });

      if (this.isPlanningOnlyRequest(sanitizedUserMessage)) {
        const plan = await this.planningResponse(sanitizedUserMessage);
        if (plan) return await this.finalizeResponse(plan, sessionId);
      }

      this.activePlan = await this.buildExecutionPlan(sanitizedUserMessage);
    }

    const startMissionSuccessCount = this.globalSuccessCount;
    let currentRetryCount = 0;
    const toolCallFrequency: Map<string, number> = new Map();
    const toolUsageCount: Map<string, number> = new Map();
    let toolExecutionCount = 0;
    let lastToolSummary = "";
    let providerFailureCount = 0;
    const totalIterationBudget = this.maxIterations + this.maxRecoveryAttempts * 5;

    iterationLoop:
    for (let iteration = 0; iteration < totalIterationBudget; iteration++) {
      const availableTools = Array.from(this.tools.values()).filter(t => (this.toolFailureCount.get(t.name) || 0) < 2);
      const toolSchemas = availableTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));

      const loopMessages = this.activePlan ? [...this.history, { role: "system", content: this.getPlanInstruction() }] : this.history;
      let response: any;
      try {
        response = await this.provider.chat(loopMessages, toolSchemas);
        providerFailureCount = 0;
      } catch (err: any) {
        providerFailureCount++;
        const errMsg = String(err?.message ?? err);
        if ((errMsg.includes("500") || errMsg.includes("429")) && providerFailureCount <= 2) {
          this.history.push({ role: "system", content: "Provider transient error occurred. Continue safely." });
          continue;
        }
        if (lastToolSummary) return await this.finalizeResponse(`Recovered via fallback evidence.\n\n${lastToolSummary}`, sessionId);
        return await this.finalizeResponse("Provider unstable. Please retry.", sessionId);
      }

      const assistantMessage = response.choices[0].message;
      const content = assistantMessage.content || "";
      this.history.push(assistantMessage);

      if (assistantMessage.tool_calls) {
        let restartWithHeal = false;
        for (const toolCall of assistantMessage.tool_calls) {
          const tool = this.tools.get(toolCall.function.name);
          if (tool) {
            this.onStatus?.(`Executing: ${tool.name}`);
            let result: string;
            let success = true;
            try {
              result = await tool.execute(toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {});
              if (result.toLowerCase().includes("error") || result.toLowerCase().includes("failed")) {
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
            this.history.push({ role: "tool", tool_call_id: toolCall.id, content: this.capToolResult(result) });
            toolExecutionCount++;
            lastToolSummary = this.summarizeToolResult(tool.name, result);
            this.markPlanProgress(success);
            if (this.memory && objectiveForMemory) this.memory.addTactic(objectiveForMemory, tool.name, result, success);
            if (toolExecutionCount >= 25) break iterationLoop;
          }
        }
        if (restartWithHeal) continue iterationLoop;
        continue;
      }

      const xmlResult = await this.parseAndExecuteXmlToolCalls(content, toolCallFrequency, toolUsageCount, sessionId, objectiveForMemory, startMissionSuccessCount);
      if (xmlResult.success) {
        toolExecutionCount++;
        lastToolSummary = this.summarizeToolResult("xml_tool", xmlResult.result || "");
        continue;
      }

      const hasNewProof = this.globalSuccessCount > startMissionSuccessCount;
      const cleanedContent = this.cleanAssistantContent(content);
      const isDone = cleanedContent.toUpperCase().includes("DONE") || cleanedContent.toUpperCase().includes("FINISH");

      if (isDone && !hasNewProof && currentRetryCount < this.maxRetries) {
          currentRetryCount++;
          this.history.push({ role: "system", content: "PoW ERROR: You claimed completion without evidence." });
          continue;
      }

      this.toolFailureCount.clear();
      this.activePlan = null;
      if (cleanedContent.length > 0) return await this.finalizeResponse(cleanedContent, sessionId);
      if (lastToolSummary) return await this.finalizeResponse(`Completed with tool evidence.\n\n${lastToolSummary}`, sessionId);
      return await this.finalizeResponse("Task completed.", sessionId);
    }

    this.toolFailureCount.clear();
    this.activePlan = null;
    return await this.finalizeResponse("Mission limit reached.", sessionId);
  }

  getHistory() {
    return this.history;
  }
}
