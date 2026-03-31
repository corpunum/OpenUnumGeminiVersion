import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class EmailTool {
  /**
   * Sends an email using the 'mail' command (part of mailutils).
   * Note: Requires system configuration for SMTP (e.g., postfix or msmtp).
   */
  async send(to: string, subject: string, body: string): Promise<string> {
    try {
      // Use 'mail' command which is standard in Linux
      // echo "Body" | mail -s "Subject" user@example.com
      const command = `echo "${body.replace(/"/g, '\\"')}" | mail -s "${subject.replace(/"/g, '\\"')}" ${to}`;
      await execAsync(command);
      return `Email sent successfully to ${to}`;
    } catch (e: any) {
      return `Failed to send email: ${e.message}. (Ensure mailutils and an SMTP client like msmtp are installed and configured)`;
    }
  }

  /**
   * Official Google Workspace CLI (gws) Integration.
   * This uses the official 'gws' binary from https://github.com/googleworkspace/cli
   */
  async sendViaGws(to: string, subject: string, body: string): Promise<string> {
    try {
      // Pattern: gws gmail +send --to <to> --subject "<subject>" --body "<body>"
      const command = `gws gmail +send --to "${to}" --subject "${subject.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;
      await execAsync(command);
      return `Email sent via Google Workspace CLI (gws) to ${to}`;
    } catch (e: any) {
      return `gws email failed: ${e.message}. (Ensure gws is installed: 'go install github.com/googleworkspace/cli/cmd/gws@latest' and 'gws auth login' is completed)`;
    }
  }

  /**
   * Advanced: List unread messages or triage inbox via gws.
   */
  async triageInbox(): Promise<string> {
    try {
      const { stdout } = await execAsync("gws gmail +triage");
      return stdout;
    } catch (e: any) {
      return `gws triage failed: ${e.message}`;
    }
  }
}
