import { $ } from "bun";

export async function runCommand(command: string): Promise<string> {
  try {
    const result = await $`${{ raw: command }}`.text();
    return result || "Command executed successfully (no output).";
  } catch (err: any) {
    return `Error executing command: ${err.message}`;
  }
}

export const execTool = {
  name: "run_command",
  description: "Execute a shell command on the local Ubuntu system.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
    },
    required: ["command"],
  },
  execute: async (args: { command: string }) => await runCommand(args.command),
};
