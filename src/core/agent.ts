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
  private maxRetries = 5;
  private maxIterations = 15; // Increased for complex tasks
  private globalSuccessCount = 0; // Persistent across the entire session
  private toolFailureCount: Map<string, number> = new Map(); // For Deterministic Pivot
  public onStatus?: (status: string) => void;

  constructor(provider: ModelProvider, systemPrompt: string, memory?: MemoryManager) {
    this.provider = provider;
    this.memory = memory;
    this.tools = new Map();
    this.history.push({ role: "system", content: systemPrompt });
  }

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
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

  async step(userMessage?: string): Promise<string> {
    if (userMessage) {
      this.history.push({ role: "user", content: userMessage });
      const tacticalContext = await this.getTacticalContext(userMessage);
      if (tacticalContext) {
        this.history.push({ role: "system", content: tacticalContext });
      }
    }

    const startMissionSuccessCount = this.globalSuccessCount; // Fixed PoW logic (Codex Fix)
    let currentRetryCount = 0;

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
          const tool = this.tools.get(toolCall.function.name);
          if (tool) {
            const args = JSON.parse(toolCall.function.arguments);
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

            if (this.memory && userMessage) {
              this.memory.addTactic(userMessage, tool.name, result, success, success ? "Verified." : "Pivot Enforced.");
            }

            if (!success && currentRetryCount < this.maxRetries) {
              currentRetryCount++;
              this.onStatus?.(`Strategy failed. Pivot in progress...`);
            }
          }
        }
        continue;
      }

      // Final Proof-of-Work check against the entire mission start count (Codex Fix)
      const hasNewProof = this.globalSuccessCount > startMissionSuccessCount;
      const isDone = content.toUpperCase().includes("DONE") || content.toUpperCase().includes("FINISH");

      if (isDone && !hasNewProof && currentRetryCount < this.maxRetries) {
          currentRetryCount++;
          const msg = "PoW ERROR: You claimed completion without evidence. Re-executing with deterministic CLI fallback.";
          this.onStatus?.(msg);
          this.history.push({ role: "system", content: msg });
          continue;
      }

      this.toolFailureCount.clear(); // Reset for next user command
      return content;
    }

    this.toolFailureCount.clear();
    return "Mission timed out after maximum iterations. Partial success recorded.";
  }

  getHistory() {
    return this.history;
  }
}
