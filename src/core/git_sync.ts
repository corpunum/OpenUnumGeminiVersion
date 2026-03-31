import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class GitSync {
  private repoPath: string;

  constructor(repoPath: string = "/home/corp-unum/OpenUnumGeminiVersion") {
    this.repoPath = repoPath;
  }

  async sync(message: string) {
    try {
      // Check if git is initialized
      await execAsync("git rev-parse --is-inside-work-tree", { cwd: this.repoPath });
    } catch (e) {
      // Initialize if not
      await execAsync("git init && git add . && git commit -m 'Initial commit'", { cwd: this.repoPath });
    }

    try {
      await execAsync("git add .", { cwd: this.repoPath });
      await execAsync(`git commit -m "[AGENT] ${message.replace(/'/g, "'\\''")}"`, { cwd: this.repoPath });
      console.log(`[GitSync] Committed: ${message}`);
      
      // Auto-push to GitHub if a remote is configured
      try {
        await execAsync("git push", { cwd: this.repoPath });
        console.log("[GitSync] Pushed to remote.");
      } catch (pushError: any) {
        // Silently ignore if no remote is configured or push fails due to auth
        console.warn("[GitSync] Push skipped or failed:", pushError.message);
      }
    } catch (e: any) {
      if (e.stdout?.includes("nothing to commit")) {
        return;
      }
      console.error("[GitSync] Error:", e.message);
    }
  }

  async restore(commitHash: string) {
    try {
      await execAsync(`git checkout ${commitHash} -- .`, { cwd: this.repoPath });
      console.log(`[GitSync] Restored to ${commitHash}`);
    } catch (e: any) {
      console.error("[GitSync] Restore failed:", e.message);
    }
  }
}
