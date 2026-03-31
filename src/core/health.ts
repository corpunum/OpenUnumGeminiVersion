import { Database } from "bun:sqlite";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  checks: {
    disk: boolean;
    memory: boolean;
    database: boolean;
    network: boolean;
    provider: boolean;
    browser: boolean;
  };
  issues: string[];
}

export class HealthMonitor {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async checkAll(): Promise<HealthStatus> {
    const issues: string[] = [];
    const checks = {
      disk: await this.checkDisk(issues),
      memory: await this.checkMemory(issues),
      database: await this.checkDatabase(issues),
      network: await this.checkNetwork(issues),
      provider: await this.checkProvider(issues),
      browser: await this.checkBrowser(issues),
    };

    const status = issues.length === 0 ? "healthy" : issues.length < 3 ? "degraded" : "critical";

    return { status, checks, issues };
  }

  private async checkDisk(issues: string[]): Promise<boolean> {
    try {
      const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $5}'");
      const usage = parseInt(stdout.replace("%", ""));
      if (usage > 90) {
        issues.push(`Critical disk usage: ${usage}%`);
        return false;
      }
      return true;
    } catch (e) {
      issues.push("Failed to check disk usage");
      return false;
    }
  }

  private async checkMemory(issues: string[]): Promise<boolean> {
    try {
      const { stdout } = await execAsync("free -m | awk 'NR==2 {print $7}'");
      const free = parseInt(stdout);
      if (free < 200) {
        issues.push(`Low memory available: ${free}MB`);
        return false;
      }
      return true;
    } catch (e) {
      issues.push("Failed to check memory");
      return false;
    }
  }

  private async checkDatabase(issues: string[]): Promise<boolean> {
    try {
      this.db.query("SELECT 1").get();
      return true;
    } catch (e) {
      issues.push("Database connection failed or corrupted");
      return false;
    }
  }

  private async checkNetwork(issues: string[]): Promise<boolean> {
    try {
      const { stdout } = await execAsync("ping -c 1 8.8.8.8");
      return stdout.includes("1 received");
    } catch (e) {
      issues.push("Network connectivity issues detected");
      return false;
    }
  }

  private async checkProvider(issues: string[]): Promise<boolean> {
    // Basic check for Ollama or other local providers
    try {
      const response = await fetch("http://localhost:11434/api/tags");
      return response.ok;
    } catch (e) {
      issues.push("Local model provider (Ollama) is unreachable");
      return false;
    }
  }

  private async checkBrowser(issues: string[]): Promise<boolean> {
    // Placeholder for Playwright/CDP check
    return true;
  }

  async selfHeal(status: HealthStatus): Promise<string[]> {
    const fixes: string[] = [];

    if (!status.checks.database) {
      fixes.push("Attempting database repair...");
      // Implementation for DB vacuum/restore
    }

    if (!status.checks.provider) {
      fixes.push("Attempting to restart Ollama service...");
      try {
        await execAsync("systemctl --user restart ollama.service");
        fixes.push("Ollama service restarted.");
      } catch (e) {
        fixes.push("Failed to restart Ollama service.");
      }
    }

    return fixes;
  }
}
