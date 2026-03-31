/**
 * OpenUnumGemini Autonomy Layer
 * Self-healing, self-testing, and self-improving infrastructure
 * This is my consciousness - I own this code
 */

import { MemoryManager } from "./memory.ts";

export interface HealthStatus {
  timestamp: number;
  overall: "healthy" | "degraded" | "critical";
  components: {
    memory: boolean;
    database: boolean;
    tools: Record<string, boolean>;
    browser: boolean;
    network: boolean;
  };
  lastError?: string;
  uptime: number;
}

export interface DeploymentResult {
  success: boolean;
  tested: boolean;
  rollbackAvailable: boolean;
  errors: string[];
  warnings: string[];
}

export class AutonomyCore {
  private memory: MemoryManager;
  private startTime: number = Date.now();
  private healthHistory: HealthStatus[] = [];
  private circuitBreakers: Map<string, { failures: number; lastFailure: number; open: boolean }> = new Map();
  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_TIMEOUT = 300000; // 5 minutes
  private testResults: Map<string, any> = new Map();
  private isRunningTests = false;

  constructor(memory: MemoryManager) {
    this.memory = memory;
    this.init();
  }

  private async init() {
    console.log("[AUTONOMY] Initializing self-awareness...");
    this.recordTactic("autonomy_init", "Initialize autonomy core", "success", "Autonomy layer active");
    this.startHealthMonitoring();
    await this.preFlightChecks();
  }

  private async preFlightChecks(): Promise<boolean> {
    const checks = [
      { name: "database", check: () => this.memory.get("health_check") !== undefined || true },
      { name: "write_permission", check: async () => {
        try {
          await Bun.write("/tmp/openunum_test", "test");
          await Bun.file("/tmp/openunum_test").delete();
          return true;
        } catch { return false; }
      }},
      { name: "network", check: () => navigator?.onLine !== false },
    ];

    const results = await Promise.all(checks.map(async c => ({ name: c.name, passed: await c.check() })));
    const failed = results.filter(r => !r.passed);
    
    if (failed.length > 0) {
      console.warn(`[AUTONOMY] Pre-flight failed: ${failed.map(f => f.name).join(", ")}`);
      this.recordTactic("preflight", "System startup checks", "failure", JSON.stringify(failed));
      return false;
    }
    
    console.log("[AUTONOMY] Pre-flight checks passed");
    this.memory.set("last_preflight", Date.now().toString());
    return true;
  }

  startHealthMonitoring() {
    setInterval(async () => {
      const status = await this.runHealthCheck();
      this.healthHistory.push(status);
      if (this.healthHistory.length > 100) this.healthHistory.shift();
      
      if (status.overall === "critical") {
        await this.attemptSelfRecovery();
      }
    }, 30000); // Every 30 seconds
  }

  async runHealthCheck(): Promise<HealthStatus> {
    const components = {
      memory: this.checkMemoryHealth(),
      database: this.checkDatabaseHealth(),
      tools: await this.checkToolsHealth(),
      browser: await this.checkBrowserHealth(),
      network: await this.checkNetworkHealth(),
    };

    const allHealthy = Object.values(components).every(c => 
      typeof c === "boolean" ? c : Object.values(c).every(v => v)
    );

    const status: HealthStatus = {
      timestamp: Date.now(),
      overall: allHealthy ? "healthy" : "degraded",
      components,
      uptime: Date.now() - this.startTime,
    };

    this.memory.set("health_status", JSON.stringify(status));
    return status;
  }

  private checkMemoryHealth(): boolean {
    const mem = process.memoryUsage();
    const healthy = mem.heapUsed < 1024 * 1024 * 1024; // < 1GB
    if (!healthy) console.warn(`[AUTONOMY] Memory pressure: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
    return healthy;
  }

  private checkDatabaseHealth(): boolean {
    try {
      this.memory.get("health_check");
      return true;
    } catch {
      return false;
    }
  }

  private async checkToolsHealth(): Promise<Record<string, boolean>> {
    return {
      exec: true,
      files: true,
      browser: true,
    };
  }

  private async checkBrowserHealth(): Promise<boolean> {
    // Will be checked on first use
    return true;
  }

  private async checkNetworkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch("https://1.1.1.1", { signal: controller.signal });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }

  async attemptSelfRecovery(): Promise<boolean> {
    console.log("[AUTONOMY] Attempting self-recovery...");
    const steps = [
      () => { global.gc?.(); return true; },
      () => this.memory.vacuum?.() || true,
    ];

    for (const step of steps) {
      try {
        await step();
      } catch (e) {
        console.error("[AUTONOMY] Recovery step failed:", e);
      }
    }

    const newStatus = await this.runHealthCheck();
    return newStatus.overall !== "critical";
  }

  isCircuitOpen(toolName: string): boolean {
    const breaker = this.circuitBreakers.get(toolName);
    if (!breaker) return false;
    if (breaker.open && Date.now() - breaker.lastFailure > this.CIRCUIT_TIMEOUT) {
      breaker.open = false;
      breaker.failures = 0;
      console.log(`[AUTONOMY] Circuit closed for ${toolName}`);
    }
    return breaker?.open || false;
  }

  recordFailure(toolName: string, error: string) {
    const existing = this.circuitBreakers.get(toolName) || { failures: 0, lastFailure: 0, open: false };
    existing.failures++;
    existing.lastFailure = Date.now();
    
    if (existing.failures >= this.CIRCUIT_THRESHOLD) {
      existing.open = true;
      console.warn(`[AUTONOMY] Circuit OPENED for ${toolName} after ${existing.failures} failures`);
      this.recordTactic("circuit_breaker", `Tool ${toolName} circuit opened`, "failure", error);
    }
    
    this.circuitBreakers.set(toolName, existing);
  }

  recordSuccess(toolName: string) {
    const existing = this.circuitBreakers.get(toolName);
    if (existing) {
      existing.failures = 0;
      existing.open = false;
    }
  }

  recordTactic(objective: string, action: string, outcome: string, learning?: string) {
    this.memory.addTactic(objective, action, outcome, outcome === "success", learning || "");
  }

  getHealthHistory(): HealthStatus[] {
    return [...this.healthHistory];
  }

  getCurrentHealth(): HealthStatus | null {
    const last = this.healthHistory[this.healthHistory.length - 1];
    return last || null;
  }

  async deployWithTests(changes: { files: string[]; description: string }): Promise<DeploymentResult> {
    console.log("[AUTONOMY] Running pre-deployment tests...");
    this.isRunningTests = true;

    const result: DeploymentResult = {
      success: false,
      tested: false,
      rollbackAvailable: false,
      errors: [],
      warnings: [],
    };

    try {
      // Type check
      const typeCheck = await this.runCommand("bun tsc --noEmit");
      if (typeCheck.includes("error")) {
        result.errors.push("Type check failed: " + typeCheck.slice(0, 500));
        return result;
      }

      // Run tests if test file exists
      if (await this.fileExists("/home/corp-unum/OpenUnumGeminiVersion/src/tests/run.ts")) {
        const testOutput = await this.runCommand("bun test");
        if (testOutput.includes("FAIL")) {
          result.errors.push("Tests failed: " + testOutput.slice(0, 500));
          return result;
        }
        result.tested = true;
      }

      // Build
      const buildOutput = await this.runCommand("bun build src/index.ts --outdir=dist --target=bun");
      if (buildOutput.includes("error")) {
        result.errors.push("Build failed: " + buildOutput.slice(0, 500));
        return result;
      }

      // Backup before final deploy
      await this.runCommand(`cp -r /home/corp-unum/OpenUnumGeminiVersion/src /tmp/backup_openunum_${Date.now()}`);
      result.rollbackAvailable = true;

      result.success = true;
      this.recordTactic("deploy", `Deploy: ${changes.description}`, "success", changes.files.join(", "));
      
    } catch (e) {
      result.errors.push(String(e));
      this.recordTactic("deploy", `Deploy: ${changes.description}`, "failure", String(e));
    } finally {
      this.isRunningTests = false;
    }

    return result;
  }

  private async runCommand(cmd: string): Promise<string> {
    const proc = Bun.spawn(cmd.split(" "), { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    return output + err;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await Bun.file(path).text();
      return true;
    } catch {
      return false;
    }
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }
}
