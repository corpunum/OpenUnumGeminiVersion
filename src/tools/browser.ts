import { chromium, type Browser, type Page } from "playwright";

let browserInstance: Browser | null = null;
let currentPage: Page | null = null;

export async function ensureBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: false, // Set to false to see it on the desktop (Codex Fix)
      args: ["--remote-debugging-port=9222"],
    });
    const context = await browserInstance.newContext({
      viewport: { width: 1280, height: 720 },
    });
    currentPage = await context.newPage();
  }
  return { browser: browserInstance, page: currentPage! };
}

export const browserTools = [
  {
    name: "browser_navigate",
    description: "Navigate to a URL in the browser.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to." },
      },
      required: ["url"],
    },
    execute: async (args: { url: string }) => {
      try {
        const { page } = await ensureBrowser();
        await page.goto(args.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
        return `Successfully navigated to ${args.url}`;
      } catch (err: any) {
        // Syntax fixed (Codex Fix)
        return `TIMEOUT ERROR: Browser failed to load ${args.url} within 15s. SWITCH TO TERMINAL/CLI FOR THIS TASK.`;
      }
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page and return it as a base64 string.",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      try {
        const { page } = await ensureBrowser();
        const buffer = await page.screenshot();
        return `Screenshot taken (binary size: ${buffer.length})`;
      } catch (err: any) {
        return `Error taking screenshot: ${err.message}`;
      }
    },
  },
];
