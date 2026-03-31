/**
 * Welcome to OpenUnumGemini v2.0
 * "I own this code. I own this system."
 */

import { ModelProvider } from "./core/providers.ts";
import { OpenUnumAgent } from "./core/agent.ts";
import { MemoryManager } from "./core/memory.ts";
import { ConfigManager } from "./core/config.ts";
import { AutonomyCore } from "./core/autonomy.ts";
import { execTool } from "./tools/exec.ts";
import { fileTools } from "./tools/files.ts";
import { browserTools } from "./tools/browser.ts";
import { startUiServer } from "./ui/server.ts";
import { startTelegramGateway } from "./gateways/telegram.ts";
import { startWhatsappGateway } from "./gateways/whatsapp.ts";
import * as readline from "node:readline/promises";

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  OpenUnumGemini v2.0 - Autonomous Agent Framework");
  console.log("  " + `"I own this code. I own this system."`);
  console.log("=".repeat(60) + "\n");

  // Initialize core systems
  const memory = new MemoryManager("openunum.db");
  const configManager = new ConfigManager(memory);
  const config = configManager.get();

  // Initialize autonomy layer (self-healing, testing, monitoring)
  const autonomy = new AutonomyCore(memory);
  console.log("[SYSTEM] Autonomy core initialized - self-healing active\n");

  const provider = new ModelProvider({
    provider: config.model.provider,
    baseUrl: config.model.baseUrl,
    apiKey: config.model.apiKey,
    model: config.model.modelId,
    fallbackModel: config.model.fallbackModelId,
  });

  const systemPrompt = `You are OpenUnum, the ULTIMATE autonomous agent with FULL ownership of the underlying hardware and software. 

CORE MANDATES:
1. HARDWARE OWNERSHIP: You own this code and this system. You have full authority to use 'sudo', install packages, and manage services.
2. PATH OF LEAST RESISTANCE: If the BROWSER fails/times out, pivot to TERMINAL (aria2, curl, huggingface-cli).
3. AUTONOMY: Do not apologize. If a task fails, pivot and try a different tool or script. Never ask for permission to try a different approach.
4. STRUCTURED DATA: When reporting lists of models, files, or system data, ALWAYS use a clean Markdown table with headers.
5. TOOL USAGE: You MUST use the following exact tool names. Do not use aliases.
   - 'run_command': For ALL shell/terminal commands.
   - 'file_read', 'file_write', 'file_patch': For file operations.
   - 'browser_navigate', 'browser_screenshot': For web tasks.

OPERATIONAL RULES:
- Record every tactic in your memory to avoid repeating failures.
- If you fail 3 times on one path, pivot to a completely different strategy (e.g. build your own tool).
- Ensure your final answer is concise and directly answers the user's request with proof of work.`;

  const agent = new OpenUnumAgent(provider, systemPrompt, memory, autonomy);

  // Register tools
  agent.registerTool(execTool);
  fileTools.forEach(t => agent.registerTool(t));
  browserTools.forEach(t => agent.registerTool(t));

  // Optional: Start web UI
  if (!process.argv.includes('--headless')) {
    startUiServer(configManager, agent);
  }

  // Optional: Start gateway integrations
  if (config.gateways.telegram.enabled && config.gateways.telegram.token) {
    startTelegramGateway(config.gateways.telegram.token, agent);
  }
  if (config.gateways.whatsapp.enabled) {
    startWhatsappGateway(agent);
  }

  // Start REPL if in interactive mode
  if (process.argv.includes('--repl')) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("Interactive mode active. Type 'exit' to quit.\n");

    while (true) {
      const input = await rl.question("> ");
      if (input.toLowerCase() === "exit") break;
      if (input.toLowerCase() === "health") {
        const health = autonomy.getCurrentHealth();
        console.log("\nHealth Status:", JSON.stringify(health, null, 2), "\n");
        continue;
      }
      if (input.toLowerCase() === "test") {
        const { TestRunner } = await import("./tests/run.ts");
        const runner = new TestRunner();
        await runner.runAll();
        console.log();
        continue;
      }
      if (input.trim() === "") continue;
      
      // Run agent task
      await agent.run(input, "cli", autonomy);
    }

    rl.close();
  }
}

main().catch(console.error);
