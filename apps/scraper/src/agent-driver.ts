// ** import core packages
import { exec } from "node:child_process";
import { promisify } from "node:util";

// ** import utils
import fs from "node:fs";

const execAsync = promisify(exec);

export class AgentDriver {
  private sessionName: string;

  constructor(sessionName: string = "harvest") {
    this.sessionName = sessionName;
  }

  private async run(command: string, timeout: number = 120_000): Promise<string> {
    const fullCommand = `agent-browser --session ${this.sessionName} ${command}`;
    try {
      const { stdout } = await execAsync(fullCommand, {
        maxBuffer: 1024 * 1024 * 50,
        timeout,
      });
      return stdout;
    } catch (error: any) {
      if (error.stdout) {
        return error.stdout;
      }
      if (error.killed || error.signal === "SIGTERM") {
        throw new Error(`agent-browser command timed out after ${timeout}ms: ${command}`);
      }
      throw error;
    }
  }

  async open(url: string): Promise<void> {
    await this.run(`open "${url}"`, 180_000);
  }

  async waitLoad(type: string = "networkidle"): Promise<void> {
    await this.run(`wait --load ${type}`, 180_000);
  }

  async wait(ms: number): Promise<void> {
    await this.run(`wait ${ms}`, Math.max(120_000, ms + 30_000));
  }

  async snapshot(): Promise<any> {
    const out = await this.run(`snapshot -i --json`);
    try {
      // agent-browser might return pure json or json wrapped in markdown if other things are printed
      const match = out.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        return JSON.parse(match[1]);
      }
      return JSON.parse(out);
    } catch (e) {
      // In case it's wrapped in boundaries
      const match2 = out.match(/---.*---\n([\s\S]*?)\n---.*---/);
      if (match2) {
          try { return JSON.parse(match2[1]); } catch(err) {}
      }
      console.error("Failed to parse snapshot JSON");
      return null;
    }
  }

  async screenshotAnnotated(path: string): Promise<any> {
    const out = await this.run(`screenshot --annotate "${path}" --json`);
    try {
      const match = out.match(/```json\n([\s\S]*?)\n```/);
      if (match) return JSON.parse(match[1]);
      return JSON.parse(out);
    } catch (e) {
      const match2 = out.match(/---.*---\n([\s\S]*?)\n---.*---/);
      if (match2) {
          try { return JSON.parse(match2[1]); } catch(err) {}
      }
      return null;
    }
  }

  async screenshot(path: string): Promise<void> {
    await this.run(`screenshot "${path}"`, 180_000);
  }

  async click(ref: string): Promise<void> {
    await this.run(`click ${ref}`);
  }

  async scrollDown(amount: number): Promise<void> {
    await this.run(`scroll down ${amount}`);
  }

  async evalStdin(js: string): Promise<string> {
    const b64 = Buffer.from(js).toString("base64");
    return await this.run(`eval -b "${b64}"`, 180_000);
  }

  async close(): Promise<void> {
    await this.run(`close`, 60_000);
  }
}
