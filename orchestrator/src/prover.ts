import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInWsl, winToWslPath, WslCommandError } from "./wsl.js";
import { SerialQueue } from "./queue.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SPEND_CIRCUIT_DIR = path.join(REPO_ROOT, "aegis-circuit");
const ATTESTATION_CIRCUIT_DIR = path.join(REPO_ROOT, "aegis-attestation-circuit");

const spendQueue = new SerialQueue();
const attestationQueue = new SerialQueue();

export interface ProofResult {
  proof: Buffer;
  publicInputs: Buffer;
  vk: Buffer;
}

/** Thrown when nargo can't solve a witness -- i.e. the circuit's own
 * constraints reject these inputs. This is the REAL compliance check: a
 * non-compliant payment (over cap, vendor not in the allow-list) cannot
 * produce a witness at all, so there is no proof to even attempt to
 * verify. Distinguishing this from a tooling failure (e.g. WSL not
 * reachable) matters for the orchestrator's event reporting. */
export class CircuitRejectedError extends Error {
  constructor(public readonly stderr: string) {
    super("circuit constraints not satisfied -- no valid witness exists");
  }
}

function toml(fields: Record<string, string | string[]>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key} = [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else {
      lines.push(`${key} = "${value}"`);
    }
  }
  return lines.join("\n") + "\n";
}

function hex32(x: bigint): string {
  return "0x" + x.toString(16).padStart(64, "0");
}

async function proveCircuit(
  dir: string,
  packageName: string,
  proverToml: string,
  queue: SerialQueue
): Promise<ProofResult> {
  return queue.run(async () => {
    await writeFile(path.join(dir, "Prover.toml"), proverToml, "utf8");
    const wslDir = winToWslPath(dir);

    try {
      await runInWsl(`cd ${wslDir} && nargo execute 2>&1`);
    } catch (err) {
      if (err instanceof WslCommandError) {
        throw new CircuitRejectedError(err.stdout + err.stderr);
      }
      throw err;
    }

    await runInWsl(
      `cd ${wslDir} && bb prove --scheme ultra_honk --oracle_hash keccak ` +
        `--bytecode_path target/${packageName}.json --witness_path target/${packageName}.gz ` +
        `--output_path target --output_format bytes_and_fields`
    );

    const vkPath = path.join(dir, "target", "vk");
    let vk: Buffer;
    try {
      vk = await readFile(vkPath);
    } catch {
      await runInWsl(
        `cd ${wslDir} && bb write_vk --scheme ultra_honk --oracle_hash keccak ` +
          `--bytecode_path target/${packageName}.json --output_path target --output_format bytes_and_fields`
      );
      vk = await readFile(vkPath);
    }

    const proof = await readFile(path.join(dir, "target", "proof"));
    const publicInputs = await readFile(path.join(dir, "target", "public_inputs"));
    return { proof, publicInputs, vk };
  });
}

export interface SpendProverInputs {
  oldBalanceCommitment: bigint;
  newBalanceCommitment: bigint;
  perTxCap: bigint;
  vendorAllowlistRoot: bigint;
  agentId: bigint;
  agentNonce: bigint;
  oldBalance: bigint;
  blindingOld: bigint;
  amount: bigint;
  newBalance: bigint;
  blindingNew: bigint;
  vendorLeaf: bigint;
  merklePath: [bigint, bigint, bigint];
  merkleIndices: [0 | 1, 0 | 1, 0 | 1];
}

export async function proveSpend(inputs: SpendProverInputs): Promise<ProofResult> {
  const proverToml = toml({
    old_balance_commitment: hex32(inputs.oldBalanceCommitment),
    new_balance_commitment: hex32(inputs.newBalanceCommitment),
    per_tx_cap: inputs.perTxCap.toString(),
    vendor_allowlist_root: hex32(inputs.vendorAllowlistRoot),
    agent_id: inputs.agentId.toString(),
    agent_nonce: inputs.agentNonce.toString(),
    old_balance: inputs.oldBalance.toString(),
    blinding_old: inputs.blindingOld.toString(),
    amount: inputs.amount.toString(),
    new_balance: inputs.newBalance.toString(),
    blinding_new: inputs.blindingNew.toString(),
    vendor_leaf: inputs.vendorLeaf.toString(),
    merkle_path: inputs.merklePath.map((p) => p.toString()),
    merkle_indices: inputs.merkleIndices.map((i) => i.toString()),
  });
  return proveCircuit(SPEND_CIRCUIT_DIR, "aegis_circuit", proverToml, spendQueue);
}

export interface AttestationProverInputs {
  startingCommitment: bigint;
  endingCommitment: bigint;
  maxSpend: bigint;
  agentId: bigint;
  periodLabel: bigint;
  startingBalance: bigint;
  blindingStart: bigint;
  endingBalance: bigint;
  blindingEnd: bigint;
}

export async function proveAttestation(inputs: AttestationProverInputs): Promise<ProofResult> {
  const proverToml = toml({
    starting_commitment: hex32(inputs.startingCommitment),
    ending_commitment: hex32(inputs.endingCommitment),
    max_spend: inputs.maxSpend.toString(),
    agent_id: inputs.agentId.toString(),
    period_label: inputs.periodLabel.toString(),
    starting_balance: inputs.startingBalance.toString(),
    blinding_start: inputs.blindingStart.toString(),
    ending_balance: inputs.endingBalance.toString(),
    blinding_end: inputs.blindingEnd.toString(),
  });
  return proveCircuit(
    ATTESTATION_CIRCUIT_DIR,
    "aegis_attestation_circuit",
    proverToml,
    attestationQueue
  );
}
