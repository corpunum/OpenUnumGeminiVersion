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
   * Advanced: Send using Google's GAM CLI if installed.
   * This is what was requested for Google Suite integration.
   */
  async sendViaGam(to: string, subject: string, body: string): Promise<string> {
    try {
      const command = `gam user ${process.env.GOOGLE_ADMIN_USER} send email to ${to} subject "${subject}" body "${body}"`;
      await execAsync(command);
      return `Email sent via GAM to ${to}`;
    } catch (e: any) {
      return `GAM email failed: ${e.message}. (Ensure GAM is installed and configured)`;
    }
  }
}
