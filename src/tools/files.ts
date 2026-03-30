import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PROJECT_ROOT = "/home/corp-unum/OpenUnumGeminiVersion";
const MAX_FILE_OUTPUT = 6000;

function resolveProjectPath(inputPath: string): string {
  const resolved = resolve(inputPath);
  if (!resolved.startsWith(PROJECT_ROOT + "/") && resolved !== PROJECT_ROOT) {
    throw new Error(`Path denied. Allowed root: ${PROJECT_ROOT}`);
  }
  return resolved;
}

function capOutput(text: string): string {
  if (text.length <= MAX_FILE_OUTPUT) return text;
  return `${text.slice(0, MAX_FILE_OUTPUT)}\n\n[TRUNCATED ${text.length - MAX_FILE_OUTPUT} chars]`;
}

export const fileTools = [
  {
    name: "read_file",
    description: `Read file content under project root only (${PROJECT_ROOT}).`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file." },
      },
      required: ["path"],
    },
    execute: async (args: { path: string }) => {
      try {
        const safePath = resolveProjectPath(args.path);
        const content = await readFile(safePath, "utf-8");
        return capOutput(content);
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }
    },
  },
  {
    name: "write_file",
    description: `Write file content under project root only (${PROJECT_ROOT}). Overwrites existing files.`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file." },
        content: { type: "string", description: "Content to write." },
      },
      required: ["path", "content"],
    },
    execute: async (args: { path: string, content: string }) => {
      try {
        const safePath = resolveProjectPath(args.path);
        await writeFile(safePath, args.content, "utf-8");
        return `Successfully wrote to ${safePath}`;
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }
    },
  },
];
