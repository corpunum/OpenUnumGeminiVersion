import { $ } from "bun";

const FORBIDDEN_PATHS = ["/home/corp-unum/openclaw"];
const MAX_COMMAND_OUTPUT = 6000;

function capOutput(text: string): string {
  if (text.length <= MAX_COMMAND_OUTPUT) return text;
  return `${text.slice(0, MAX_COMMAND_OUTPUT)}\n\n[TRUNCATED ${text.length - MAX_COMMAND_OUTPUT} chars]`;
}

export async function runCommand(command: string): Promise<string> {
  const lower = command.toLowerCase();
  if (FORBIDDEN_PATHS.some(path => lower.includes(path.toLowerCase()))) {
    return `Error executing command: Path denied. Commands must stay within /home/corp-unum/OpenUnumGeminiVersion`;
  }

  try {
    const result = await $`${{ raw: command }}`.text();
    return capOutput(result || "Command executed successfully (no output).");
  } catch (err: any) {
    return `Error executing command: ${err.message}`;
  }
}

export const execTool = {
  name: "run_command",
  description: "Execute a shell command for the current project context. Do not access /home/corp-unum/openclaw.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
    },
    required: ["command"],
  },
  execute: async (args: { command: string }) => await runCommand(args.command),
};
