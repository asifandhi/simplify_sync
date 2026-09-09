import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export interface FirewallStatus {
  success: boolean;
  rulesActive: boolean;
  networkProfile: string;
  networkName: string;
  isPublic: boolean;
  error?: string;
}

export async function manageFirewall(action: "check" | "enable" | "disable"): Promise<FirewallStatus> {
  const scriptPath = path.join(process.cwd(), "scripts", "firewall.ps1");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Action", action],
      { timeout: 45000 }
    );
    const trimmed = stdout.trim();
    // Parse last line in case of extraneous powershell banner
    const lines = trimmed.split("\n");
    const jsonLine = lines[lines.length - 1].trim();
    const result = JSON.parse(jsonLine);
    return result;
  } catch (err: any) {
    console.error(`[FirewallManager] Error running action '${action}':`, err);
    if (err.stdout) {
      try {
        const lines = err.stdout.trim().split("\n");
        const jsonLine = lines[lines.length - 1].trim();
        const parsed = JSON.parse(jsonLine);
        return parsed;
      } catch (_) {}
    }
    return {
      success: false,
      rulesActive: false,
      networkProfile: "Unknown",
      networkName: "Unknown",
      isPublic: false,
      error: err.message || "Failed to execute firewall configuration",
    };
  }
}
