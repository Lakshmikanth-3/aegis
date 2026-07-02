import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Real toolchain locations inside WSL Ubuntu, installed and version-pinned
// to match what rs-soroban-ultrahonk's own circuits/scripts/build_one.sh
// uses (Noir 1.0.0-beta.9, bb v0.87.0) so generated proofs are binary
// compatible with the vendored verifier crate. See top-level README.
const TOOLCHAIN_PATH =
  '"$HOME/.local/bin:$HOME/.nargo/bin:$HOME/.bb087/bin:$HOME/.cargo/bin:$PATH"';

export function winToWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) throw new Error(`Not an absolute Windows path: ${winPath}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

export interface WslResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs a shell command for real inside WSL Ubuntu (where the real
 * nargo/bb/stellar-cli toolchain lives -- none of it is installable on
 * Windows directly, see README). Throws with combined stdout+stderr on
 * non-zero exit so callers can inspect real tool failures (e.g. a Noir
 * circuit assertion failing because a payment is genuinely non-compliant).
 */
export async function runInWsl(command: string, timeoutMs = 120_000): Promise<WslResult> {
  const fullCommand = `export PATH=${TOOLCHAIN_PATH}; ${command}`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "wsl.exe",
      ["-d", "Ubuntu", "--", "bash", "-lc", fullCommand],
      { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs }
    );
    return { stdout, stderr };
  } catch (err: any) {
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? String(err.message ?? err);
    throw new WslCommandError(`WSL command failed: ${command}`, stdout, stderr);
  }
}

export class WslCommandError extends Error {
  constructor(message: string, public stdout: string, public stderr: string) {
    super(`${message}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
    this.name = "WslCommandError";
  }
}
