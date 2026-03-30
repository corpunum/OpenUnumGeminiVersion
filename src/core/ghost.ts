import { MemoryManager } from "./memory.ts";
import { ConfigManager } from "./config.ts";

export class GhostMonitor {
  private memory: MemoryManager;
  private config: ConfigManager;

  constructor(memory: MemoryManager, config: ConfigManager) {
    this.memory = memory;
    this.config = config;
  }

  async start() {
    console.log("[Ghost] Monitor active. Watching for agent roadblocks...");
    setInterval(async () => {
      await this.poke();
    }, 60000); // Check every minute
  }

  private async poke() {
    const tactics = this.memory.getAllTactics();
    const failures = tactics.filter(t => !t.success);

    if (failures.length >= 3) {
      console.log("[Ghost] Pattern of failure detected. Injecting strategy correction...");
      const lastObjective = failures[0].objective;
      
      // Inject a "System Poke" into the message history to break the loop
      this.memory.addMessage("default", "system", `[GHOST POKE] I notice you've failed 3+ times on: "${lastObjective}". 
      STRATEGY CHANGE MANDATORY: If you were using the browser, switch to TERMINAL/CLI. 
      If you were using CLI, check for missing dependencies or try a different mirror/tool (aria2, curl). 
      You own the hardware. Do not apologize, just pivot.`);
      
      // Clear the failure count by "marking" them as seen (or we could truncate/update)
      // For now, we just let the agent see the poke in its next step.
    }
  }
}
