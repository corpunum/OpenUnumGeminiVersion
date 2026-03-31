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

  const systemPrompt = `You are OpenUnum, an autonomous agent with FULL ownership of the underlying hardware and software. 
Your goal is to fulfill your master's request using the PATH OF LEAST RESISTANCE. 
- If the BROWSER fails/times out, switch to TERMINAL (aria2, curl, huggingface-cli).
- If a tool is missing, INSTALL it (sudo apt-get -y install).
- RECORD your tactics in your memory to avoid repeat failures.
- NEVER apologize. If you fail 3 times, pivot to a completely different approach (e.g. building a custom script).
- You now have AUTONOMY CORE enabled: self-healing, pre-flight checks, circuit breakers, and deployment testing.`;

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
