import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export class SkillManager {
  private skillsDir: string;

  constructor(skillsDir: string = "/home/corp-unum/OpenUnumGeminiVersion/src/tools/skills") {
    this.skillsDir = skillsDir;
  }

  async listSkills(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.skillsDir);
      return files.filter(f => f.endsWith(".ts") || f.endsWith(".js"));
    } catch (e) {
      return [];
    }
  }

  async installSkill(name: string, content: string): Promise<string> {
    const filePath = path.join(this.skillsDir, name);
    
    // Security Review Prompting Logic would be triggered here in the UI
    await fs.writeFile(filePath, content);
    return `Skill ${name} installed. PLEASE REVIEW THE CODE BEFORE EXECUTION.`;
  }

  async executeSkill(name: string, args: any[]): Promise<any> {
    const filePath = path.join(this.skillsDir, name);
    try {
      const skill = await import(filePath);
      if (typeof skill.default === "function") {
        return await skill.default(...args);
      } else if (typeof skill.execute === "function") {
        return await skill.execute(...args);
      }
      throw new Error("Skill does not export a default function or execute() function.");
    } catch (e: any) {
      return `Error executing skill ${name}: ${e.message}`;
    }
  }

  async generateSecurityReport(name: string): Promise<string> {
    const filePath = path.join(this.skillsDir, name);
    const content = await fs.readFile(filePath, "utf-8");
    
    // Simple regex-based security scan
    const suspicious = [];
    if (content.includes("eval(")) suspicious.push("Uses eval()");
    if (content.includes("child_process")) suspicious.push("Uses child_process (shell access)");
    if (content.includes("fs.")) suspicious.push("Uses fs (file system access)");
    if (content.includes("fetch(") || content.includes("http")) suspicious.push("Uses network access");

    return `Security Report for ${name}:\n` + 
           (suspicious.length > 0 
             ? `WARNING: This skill has access to: ${suspicious.join(", ")}` 
             : "No immediate high-risk patterns detected.");
  }
}
