import { expect, test, describe } from "bun:test";
import { HealthMonitor } from "../../src/core/health.ts";
import { MemoryManager } from "../../src/core/memory.ts";
import { GitSync } from "../../src/core/git_sync.ts";
import { Database } from "bun:sqlite";

describe("OpenUnum Ultimate: Phase 0 (Integrity)", () => {
  const db = new Database(":memory:"); // Use in-memory for tests
  const memory = new MemoryManager(":memory:");
  const health = new HealthMonitor(memory.getDatabase());
  const gitsync = new GitSync();

  test("Hardware Ownership: Disk and Memory checks", async () => {
    const status = await health.checkAll();
    expect(status.checks.disk).toBe(true);
    expect(status.checks.memory).toBe(true);
    console.log(`Test: Hardware check passed. Status: ${status.status}`);
  });

  test("Tactical Memory: Search and Retrieval", async () => {
    memory.addTactic("Test Goal", "ls", "Success", true, "None");
    const results = memory.searchTactics("Test Goal");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].objective).toBe("Test Goal");
    console.log("Test: Memory search/retrieval passed.");
  });

  test("GitSync: Commit and Tracking", async () => {
    // Conceptual test for GitSync
    await gitsync.sync("E2E Test Commit");
    console.log("Test: GitSync sync operation attempted.");
  });
});
