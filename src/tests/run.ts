/**
 * OpenUnumGemini Test Suite
 * Self-testing before any deployment
 */

import { AutonomyCore } from "../core/autonomy.ts";
import { MemoryManager } from "../core/memory.ts";

const PASS = "✓ PASS";
const FAIL = "✗ FAIL";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class TestRunner {
  private results: TestResult[] = [];
  private memory: MemoryManager;
  private autonomy: AutonomyCore;

  constructor() {
    this.memory = new MemoryManager(":memory:");
    this.autonomy = new AutonomyCore(this.memory);
  }

  async runAll(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
    console.log("\n🧪 OpenUnumGemini Self-Test Suite\n");
    console.log("=" .repeat(50));

    // Core tests
    await this.test("Memory Manager", async () => {
      this.memory.set("test_key", "test_value");
      const val = this.memory.get("test_key");
      if (val !== "test_value") throw new Error("Memory read/write failed");
    });

    await this.test("Autonomy Health Check", async () => {
      const health = await this.autonomy.runHealthCheck();
      if (health.overall !== "healthy") throw new Error(`Health check failed: ${health.overall}`);
    });

    await this.test("Circuit Breaker", async () => {
      const tool = "test_tool";
      if (this.autonomy.isCircuitOpen(tool)) throw new Error("Circuit should be closed initially");
      this.autonomy.recordFailure(tool, "test error");
      this.autonomy.recordFailure(tool, "test error");
      this.autonomy.recordFailure(tool, "test error");
      if (!this.autonomy.isCircuitOpen(tool)) throw new Error("Circuit should be open after 3 failures");
      this.autonomy.recordSuccess(tool);
      if (this.autonomy.isCircuitOpen(tool)) throw new Error("Circuit should be closed after success");
    });

    await this.test("Tactic Recording", async () => {
      this.autonomy.recordTactic("test_objective", "test_action", "test_outcome", "test_learning");
      const tactics = this.memory.getTactics("test_objective");
      if (tactics.length === 0) throw new Error("Tactic not recorded");
    });

    // Print results
    console.log("\n" + "=".repeat(50));
    console.log("\n📊 Test Results\n");

    for (const result of this.results) {
      const status = result.passed ? PASS : FAIL;
      console.log(`${status}: ${result.name} (${result.duration}ms)`);
      if (result.error) console.log(`  └─ Error: ${result.error}`);
    }

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log("\n" + "=".repeat(50));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log("=".repeat(50) + "\n");

    return { passed, failed, results: this.results };
  }

  private async test(name: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      this.results.push({ name, passed: true, duration: Date.now() - start });
    } catch (e) {
      this.results.push({ 
        name, 
        passed: false, 
        duration: Date.now() - start,
        error: String(e) 
      });
    }
  }
}

// Run tests if this is the main module
if (import.meta.main) {
  const runner = new TestRunner();
  const results = await runner.runAll();
  process.exit(results.failed > 0 ? 1 : 0);
}

export { TestRunner };
