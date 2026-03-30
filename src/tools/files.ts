import { readFile, writeFile } from "node:fs/promises";

export const fileTools = [
  {
    name: "read_file",
    description: "Read the content of a file on the local system.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file." },
      },
      required: ["path"],
    },
    execute: async (args: { path: string }) => {
      try {
        return await readFile(args.path, "utf-8");
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }
    },
  },
  {
    name: "write_file",
    description: "Write content to a file on the local system (overwrites existing).",
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
        await writeFile(args.path, args.content, "utf-8");
        return `Successfully wrote to ${args.path}`;
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }
    },
  },
];
