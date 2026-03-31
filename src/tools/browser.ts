/**
 * OpenUnumGemini Browser Tool + Autonomous Navigation
 * Handles playwright imports with fallback to curl-based browser
 */

import { $ } from "bun";

let playwright: any = null;

try {
  const pw = await import("playwright");
  playwright = pw;
} catch {
  console.log("[BROWSER] Playwright not available, using curl fallback");
}

export class BrowserAutomation {
  private browser: any = null;
  private page: any = null;
  private _isReady = false;

  async launch(headless = true): Promise<boolean> {
    if (!playwright?.chromium) return false;
    
    try {
      this.browser = await playwright.chromium.launch({ headless });
      this.page = await this.browser.newPage();
      this._isReady = true;
      return true;
    } catch (e) {
      console.error("[BROWSER] Launch failed:", e);
      return false;
    }
  }

  async navigate(url: string): Promise<string> {
    if (!this._isReady && playwright?.chromium) {
      await this.launch();
    }

    if (this.page) {
      try {
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        return `Navigated to ${url}`;
      } catch (e: any) {
        console.warn(`[BROWSER] Navigate failed, falling back: ${e.message}`);
      }
    }

    // Fallback
    const result = await $`curl -s -L --max-time 15 "${url}" || echo "Failed to fetch ${url}"`.text();
    return result.slice(0, 10000);
  }

  async screenshot(): Promise<string> {
    if (!this.page) return "Error: Browser not ready";
    try {
      const screenshot = await this.page.screenshot({ type: "png" });
      return `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  async getLinks(): Promise<string> {
    if (!this.page) return "Error: Browser not ready";
    const links = await this.page.$$eval("a", (els: any[]) => els.map(a => a.textContent).slice(0, 20));
    return links.join("\n");
  }

  async isReady(): Promise<boolean> {
    return this._isReady;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this._isReady = false;
    }
  }
}

// Create singleton
const browserInstance = new BrowserAutomation();

export const browserTools = [
  {
    name: "browser_navigate",
    description: "Navigate browser to a URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to." },
      },
      required: ["url"],
    },
    execute: async (args: { url: string }) => {
      return await browserInstance.navigate(args.url);
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of current page and return as base64",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      return await browserInstance.screenshot();
    },
  },
];

export { browserInstance };
