import { ModelProvider } from "./core/providers.ts";
import { OpenUnumAgent } from "./core/agent.ts";
import { MemoryManager } from "./core/memory.ts";
import { ConfigManager } from "./core/config.ts";
import { execTool } from "./tools/exec.ts";
import { fileTools } from "./tools/files.ts";
import { browserTools } from "./tools/browser.ts";
import { startUiServer } from "./ui/server.ts";
import { startTelegramGateway } from "./gateways/telegram.ts";
import { startWhatsappGateway } from "./gateways/whatsapp.ts";
import { GhostMonitor } from "./core/ghost.ts";
import * as readline from "node:readline/promises";

async function main() {
  const memory = new MemoryManager("openunum.db");
  const configManager = new ConfigManager(memory);
  const config = configManager.get();

  const provider = new ModelProvider({
    provider: config.model.provider,
    baseUrl: config.model.baseUrl,
    apiKey: config.model.apiKey,
    model: config.model.modelId,
    fallbackModel: config.model.fallbackModelId,
  });

  const systemPrompt = `You are OpenUnum, an autonomous agent with FULL ownership of the underlying hardware and software. \nYour goal is to fulfill your master's request using the PATH OF LEAST RESISTANCE. \n- If the BROWSER fails/times out, switch to TERMINAL (aria2, curl, huggingface-cli).\n- If a tool is missing, INSTALL it (sudo apt-get -y install).\n- RECORD your tactics in your memory to avoid repeat failures.\n- NEVER apologize. If you fail 3 times, pivot to a completely different approach (e.g. building a custom script).`;

  const agent = new OpenUnumAgent(provider, systemPrompt, memory);

  // Start Ghost Monitor (Background Poke Mechanism)
  const ghost = new GhostMonitor(memory, configManager);
  ghost.start();

  // Register tools
  agent.registerTool(execTool);
  fileTools.forEach(t => agent.registerTool(t));
  browserTools.forEach(t => agent.registerTool(t));

  // Start UI Server
  startUiServer(configManager, agent);

  // Start Gateways
  if (config.gateways.telegram.enabled && config.gateways.telegram.token) {
    startTelegramGateway(config.gateways.telegram.token, agent);
  }

  if (config.gateways.whatsapp.enabled) {
    startWhatsappGateway(agent);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("--- OpenUnum Gemini CLI ---");
  console.log("UI: http://localhost:" + config.ui.port);
  console.log("Type 'exit' to quit.");

  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") break;

    try {
      const response = await agent.step(input, "cli");
      console.log(`\nOpenUnum: ${response}\n`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  }

  rl.close();
}

main();
