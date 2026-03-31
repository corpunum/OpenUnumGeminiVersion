import { MemoryManager } from "./memory.ts";
import { ConfigManager } from "./config.ts";
import { HealthMonitor } from "./health.ts";

export class GhostMonitor {
  private memory: MemoryManager;
  private config: ConfigManager;
  private health: HealthMonitor;

  constructor(memory: MemoryManager, config: ConfigManager) {
    this.memory = memory;
    this.config = config;
    this.health = new HealthMonitor(memory.getDatabase());
  }

  async start() {
    console.log("[Ghost] Monitor active. Watching for agent roadblocks and system health...");
    setInterval(async () => {
      await this.monitor();
    }, 60000); // Check every minute
  }

  private async monitor() {
    // 1. Check System Health
    const healthStatus = await this.health.checkAll();
    if (healthStatus.status !== "healthy") {
      console.log(`[Ghost] System status: ${healthStatus.status}. Issues: ${healthStatus.issues.join(", ")}`);
      const fixes = await this.health.selfHeal(healthStatus);
      if (fixes.length > 0) {
        this.memory.addMessage("default", "system", `[GHOST SELF-HEAL] I've detected and fixed system issues: ${fixes.join("; ")}`);
      }
    }

    // 2. Tactical Failure Detection (The "Poke")
    const tactics = this.memory.getAllTactics();
    const failures = tactics.filter(t => !t.success && t.timestamp > Date.now() - 300000); // Failures in last 5 mins

    if (failures.length >= 3) {
      console.log("[Ghost] Pattern of failure detected. Injecting strategy correction...");
      const lastObjective = failures[failures.length - 1].objective;
      
      this.memory.addMessage("default", "system", `[GHOST POKE] I notice you've failed 3+ times on: "${lastObjective}". 
      STRATEGY CHANGE MANDATORY: 
      1. If using the Browser, pivot to CLI/TERMINAL (curl, aria2, etc.).
      2. Check if a dependency is missing and install it using 'apt' or 'npm'.
      3. Verify your assumptions by reading files or checking man pages.
      You own the hardware. Do not apologize, just pivot and execute.`);
    }

    // 3. Success Reinforcement (Learning)
    const successes = tactics.filter(t => t.success && t.timestamp > Date.now() - 60000);
    if (successes.length > 0) {
      // Optional: Log success patterns to a separate "Wisdom" ledger
    }
  }
}
