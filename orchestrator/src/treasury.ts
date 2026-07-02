import {
  balanceCommitment,
  fieldToHex,
  VendorAllowlist,
  vendorIdFromName,
} from "./poseidon.js";
import { proveSpend, proveAttestation, CircuitRejectedError } from "./prover.js";
import * as chain from "./chain.js";
import { VENDOR_NAMES } from "./roster.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

export interface BalanceSnapshot {
  balance: bigint;
  blinding: bigint;
  timestamp: string;
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  roleBadge: string;
  balance: bigint;
  blinding: bigint;
  nonce: number;
  perTxCap: number;
  allocatedBudget: number;
  periodStartBalance: bigint;
  periodStartBlinding: bigint;
  registrationTxHash: string | null;
  /** Every real (balance, blinding) pair this agent has ever held, oldest
   * first, starting from registration. Lets the attestation period
   * selector reconstruct a genuine historical starting point (e.g. "24
   * hours ago") instead of only ever attesting from whenever
   * start_attestation_period was last clicked. */
  history: BalanceSnapshot[];
}

export interface PaymentEvent {
  seq: number;
  agentId: number;
  agentName: string;
  amount: number;
  vendor: string;
  vendorId: string;
  timestamp: string;
  status: "verified" | "rejected";
  rejectReason?: "over_cap" | "vendor_not_allowlisted";
  rejectDetail?: string;
  oldCommitment: string;
  newCommitment: string;
  nonceUsed: number;
  proofBytes: number;
  txHash: string | null;
  explorerUrl: string | null;
}

export type AttestationPeriod = "24h" | "7d" | "session";

export interface Attestation {
  agentId: number;
  agentName: string;
  periodLabel: string;
  periodType: AttestationPeriod;
  periodStartTimestamp: string;
  periodClamped: boolean;
  maxSpendClaim: number;
  vendorComplianceOk: boolean;
  startingCommitment: string;
  endingCommitment: string;
  proofBytes: number;
  txHash: string | null;
  explorerUrl: string | null;
  verifyToken: string;
  generatedAt: string;
  contractId: string;
}

let nextSeq = 1;
let nextBlinding = 1000n;

function explorerUrl(txHash: string | null): string | null {
  return txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : null;
}

export class Treasury {
  admin = "";
  contractId = "";
  perTxCap = 500;
  vendors: string[] = [...VENDOR_NAMES];
  allowlist: VendorAllowlist;
  agents = new Map<number, Agent>();
  events: PaymentEvent[] = [];
  attestations = new Map<string, Attestation>();
  ready = false;
  initError: string | null = null;

  constructor() {
    this.allowlist = this.rebuildAllowlist();
  }

  rebuildAllowlist(): VendorAllowlist {
    this.allowlist = new VendorAllowlist(this.vendors.map(vendorIdFromName));
    return this.allowlist;
  }

  get allowlistRootHex(): string {
    return fieldToHex(this.allowlist.root);
  }

  /**
   * Real bootstrap: builds the contract, deploys it to Stellar testnet,
   * and installs the real spend_proof + compliance_attestation
   * verification keys generated earlier by `bb write_vk`. Every step here
   * is a real network call -- this is what the manual deploy/ scripts did
   * by hand, automated.
   */
  async bootstrap(onLog: (msg: string) => void): Promise<void> {
    try {
      onLog("Ensuring funded Stellar testnet identity...");
      this.admin = await chain.ensureAdminIdentity();
      onLog(`Admin: ${this.admin}`);

      onLog("Building AegisTreasury contract (cargo + stellar contract build)...");
      await chain.buildContract();

      onLog("Deploying to Stellar testnet...");
      const { contractId, txHash } = await chain.deployContract();
      this.contractId = contractId;
      onLog(`Deployed: ${contractId} (tx ${txHash})`);

      const vk = await readFile(path.join(REPO_ROOT, "aegis-circuit", "target", "vk"));
      onLog("Initializing contract with real spend_proof verification key...");
      const initRes = await chain.initContract(contractId, this.allowlistRootHex.slice(2), vk.toString("hex"));
      onLog(`init tx: ${initRes.txHash}`);

      const attestationVk = await readFile(
        path.join(REPO_ROOT, "aegis-attestation-circuit", "target", "vk")
      );
      onLog("Installing compliance_attestation verification key...");
      const vkRes = await chain.initAttestationVk(contractId, attestationVk.toString("hex"));
      onLog(`init_attestation_vk tx: ${vkRes.txHash}`);

      onLog("Setting initial policy (per-tx cap + vendor allow-list)...");
      const polRes = await chain.updatePolicy(contractId, this.perTxCap, this.allowlistRootHex.slice(2));
      onLog(`update_policy tx: ${polRes.txHash}`);

      this.ready = true;
      onLog("Bootstrap complete -- contract is live on Stellar testnet.");
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      onLog(`Bootstrap FAILED: ${this.initError}`);
      throw err;
    }
  }

  async setVendors(vendors: string[]): Promise<string | null> {
    if (vendors.length === 0 || vendors.length > 8) {
      throw new Error("allow-list supports 1-8 vendors at this circuit's Merkle depth");
    }
    this.vendors = vendors;
    this.rebuildAllowlist();
    const res = await chain.updatePolicy(this.contractId, this.perTxCap, this.allowlistRootHex.slice(2));
    return res.txHash;
  }

  async setPerTxCap(cap: number): Promise<string | null> {
    this.perTxCap = cap;
    const res = await chain.updatePolicy(this.contractId, this.perTxCap, this.allowlistRootHex.slice(2));
    for (const agent of this.agents.values()) agent.perTxCap = cap;
    return res.txHash;
  }

  /** Registers a new agent both locally (the orchestrator is the only
   * party that ever knows the plaintext balance/blinding -- exactly the
   * "off-chain Prover Service" role from the PRD's architecture) and for
   * real on the deployed contract. */
  async registerAgent(
    name: string,
    startingBudget: number,
    perTxCap?: number,
    description = "",
    roleBadge = ""
  ): Promise<Agent> {
    const id = this.agents.size + 1;
    const blinding = nextBlinding++;
    const balance = BigInt(startingBudget);
    const commitment = balanceCommitment(balance, blinding, BigInt(id));

    const registerRes = await chain.registerAgent(this.contractId, id, fieldToHex(commitment).slice(2));
    // Also starts the agent's first attestation period on-chain, in the
    // same instant as this initial commitment, so verify_attestation has
    // a valid PeriodStartCommitment to read from day one.
    await chain.startAttestationPeriod(this.contractId, id);

    // per_tx_cap is enforced on-chain as ONE treasury-wide policy value
    // (DataKey::PerTxCap, set only by update_policy) -- the contract
    // rejects any submit_spend whose proof was built against a cap that
    // doesn't match current on-chain state (AllowlistRootMismatch's
    // sibling check, PerTxCapMismatch). So an agent can't really have its
    // own cap distinct from the treasury's; `perTxCap` here is informational
    // only and is always kept equal to the live treasury value when a
    // payment is actually proved (see attemptPayment).
    if (perTxCap !== undefined && perTxCap !== this.perTxCap) {
      throw new Error(
        `per_tx_cap is a single treasury-wide on-chain policy value (currently ${this.perTxCap}); ` +
          `call setPerTxCap to change it for everyone, an individual agent can't override it`
      );
    }
    const agent: Agent = {
      id,
      name,
      description,
      roleBadge,
      balance,
      blinding,
      nonce: 0,
      perTxCap: this.perTxCap,
      allocatedBudget: startingBudget,
      periodStartBalance: balance,
      periodStartBlinding: blinding,
      registrationTxHash: registerRes.txHash,
      history: [{ balance, blinding, timestamp: new Date().toISOString() }],
    };
    this.agents.set(id, agent);
    return agent;
  }

  /** Finds the most recent real (balance, blinding) snapshot at or before
   * `cutoff`, or the earliest snapshot on record if the agent's whole
   * history postdates the cutoff (nothing older exists to report --
   * `clamped` tells the caller that happened, so the UI can say so rather
   * than silently misrepresenting the window). */
  snapshotAsOf(agent: Agent, cutoff: Date): { snapshot: BalanceSnapshot; clamped: boolean } {
    const cutoffIso = cutoff.toISOString();
    let chosen = agent.history[0];
    for (const h of agent.history) {
      if (h.timestamp <= cutoffIso) chosen = h;
      else break;
    }
    const clamped = chosen === agent.history[0] && agent.history[0].timestamp > cutoffIso;
    return { snapshot: chosen, clamped };
  }

  commitmentOf(agent: Agent): bigint {
    return balanceCommitment(agent.balance, agent.blinding, BigInt(agent.id));
  }

  /**
   * Attempts one real agent payment: builds a real Prover.toml, runs
   * `nargo execute` + `bb prove` for a real UltraHonk proof, and -- if the
   * circuit could solve a witness at all -- submits it to the real
   * deployed contract on Stellar testnet. A non-compliant payment (over
   * cap, OR a vendor with no valid Merkle path in the current allow-list)
   * is always routed through the real nargo/bb pipeline: for an unknown
   * vendor we still submit a syntactically valid proof attempt (the real
   * leaf-0 Merkle path with the actual wrong vendor leaf substituted in,
   * see VendorAllowlist.proofForUnknown), so it's the circuit's own
   * root-recompute assertion that fails, not a JS-side allow-list lookup.
   * There is no JS reimplementation of the policy deciding pass/fail
   * anywhere in this method.
   */
  async attemptPayment(agent: Agent, amount: number, vendor: string): Promise<PaymentEvent> {
    const oldCommitment = this.commitmentOf(agent);
    const vendorId = vendorIdFromName(vendor);
    const timestamp = new Date().toISOString();
    const seq = nextSeq++;

    let merkleProof;
    let vendorKnown = true;
    try {
      merkleProof = this.allowlist.proofFor(vendorId);
    } catch {
      vendorKnown = false;
      merkleProof = this.allowlist.proofForUnknown(vendorId);
    }

    const newBalance = agent.balance - BigInt(amount);
    const newBlinding = nextBlinding++;
    const newCommitment = balanceCommitment(newBalance, newBlinding, BigInt(agent.id));

    let proofBytes: Buffer;
    try {
      const result = await proveSpend({
        oldBalanceCommitment: oldCommitment,
        newBalanceCommitment: newCommitment,
        perTxCap: BigInt(this.perTxCap),
        vendorAllowlistRoot: this.allowlist.root,
        agentId: BigInt(agent.id),
        agentNonce: BigInt(agent.nonce),
        oldBalance: agent.balance,
        blindingOld: agent.blinding,
        amount: BigInt(amount),
        newBalance,
        blindingNew: newBlinding,
        vendorLeaf: vendorId,
        merklePath: merkleProof.path,
        merkleIndices: merkleProof.indices,
      });
      proofBytes = result.proof;
    } catch (err) {
      const detail = err instanceof CircuitRejectedError ? err.stderr : String(err);
      return this.recordEvent({
        seq,
        agentId: agent.id,
        agentName: agent.name,
        amount,
        vendor,
        vendorId: vendorId.toString(),
        timestamp,
        status: "rejected",
        rejectReason: vendorKnown ? "over_cap" : "vendor_not_allowlisted",
        rejectDetail: vendorKnown
          ? extractNoirAssertionFailure(detail)
          : `"${vendor}" is not in the current Merkle allow-list -- the real circuit's ` +
            `root-recompute assertion rejects it (${extractNoirAssertionFailure(detail)}).`,
        oldCommitment: fieldToHex(oldCommitment),
        newCommitment: fieldToHex(oldCommitment),
        nonceUsed: agent.nonce,
        proofBytes: 0,
        txHash: null,
        explorerUrl: null,
      });
    }

    const submitResult = await chain.submitSpend(
      this.contractId,
      agent.id,
      proofBytes.toString("hex"),
      {
        agentId: agent.id,
        agentNonce: agent.nonce,
        newBalanceCommitment: fieldToHex(newCommitment).slice(2),
        oldBalanceCommitment: fieldToHex(oldCommitment).slice(2),
        perTxCap: this.perTxCap,
        vendorAllowlistRoot: this.allowlistRootHex.slice(2),
      }
    );

    agent.balance = newBalance;
    agent.blinding = newBlinding;
    agent.history.push({ balance: newBalance, blinding: newBlinding, timestamp });
    const nonceUsed = agent.nonce;
    agent.nonce += 1;

    return this.recordEvent({
      seq,
      agentId: agent.id,
      agentName: agent.name,
      amount,
      vendor,
      vendorId: vendorId.toString(),
      timestamp,
      status: "verified",
      oldCommitment: fieldToHex(oldCommitment),
      newCommitment: fieldToHex(newCommitment),
      nonceUsed,
      proofBytes: proofBytes.length,
      txHash: submitResult.txHash,
      explorerUrl: explorerUrl(submitResult.txHash),
    });
  }

  private recordEvent(event: PaymentEvent): PaymentEvent {
    this.events.push(event);
    return event;
  }

  /** Snapshots both the orchestrator's secret state AND the contract's
   * on-chain PeriodStartCommitment in the same call, so they refer to the
   * same instant -- generateAttestation only proves/verifies against an
   * already-started period, it never starts one itself. */
  async startAttestationPeriod(agent: Agent) {
    agent.periodStartBalance = agent.balance;
    agent.periodStartBlinding = agent.blinding;
    await chain.startAttestationPeriod(this.contractId, agent.id);
  }

  /** Generates and on-chain-verifies a real compliance_attestation proof
   * for an agent's spend over the requested period.
   *
   * "session" uses the existing periodStart* snapshot (set by
   * startAttestationPeriod) and the on-chain PeriodStartCommitment already
   * matches it. "24h"/"7d" instead resolve a REAL historical (balance,
   * blinding) pair from agent.history via snapshotAsOf -- the actual
   * private values the orchestrator held at that past point in time, not
   * a fabricated figure -- and push the matching commitment on-chain via
   * set_period_start_commitment before proving, so the contract's stored
   * starting point genuinely reflects that window.
   */
  async generateAttestation(
    agent: Agent,
    periodLabel: string,
    period: AttestationPeriod = "session"
  ): Promise<Attestation> {
    let startingBalance: bigint;
    let startingBlinding: bigint;
    let periodStartTimestamp: string;
    let periodClamped = false;

    if (period === "session") {
      startingBalance = agent.periodStartBalance;
      startingBlinding = agent.periodStartBlinding;
      periodStartTimestamp = agent.history[0]?.timestamp ?? new Date().toISOString();
    } else {
      const cutoffMs = Date.now() - (period === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
      const { snapshot, clamped } = this.snapshotAsOf(agent, new Date(cutoffMs));
      startingBalance = snapshot.balance;
      startingBlinding = snapshot.blinding;
      periodStartTimestamp = snapshot.timestamp;
      periodClamped = clamped;
      const historicalCommitment = balanceCommitment(startingBalance, startingBlinding, BigInt(agent.id));
      await chain.setPeriodStartCommitment(this.contractId, agent.id, fieldToHex(historicalCommitment).slice(2));
    }

    const startingCommitment = balanceCommitment(startingBalance, startingBlinding, BigInt(agent.id));
    const endingCommitment = this.commitmentOf(agent);
    const actualSpend = startingBalance - agent.balance;
    const maxSpendClaim = Math.ceil(Number(actualSpend > 0n ? actualSpend : 0n) / 1000) * 1000 || 0;
    const periodLabelNum = BigInt(
      periodLabel
        .split("")
        .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 1_000_000_000, 0)
    );

    const { proof } = await proveAttestation({
      startingCommitment,
      endingCommitment,
      maxSpend: BigInt(maxSpendClaim),
      agentId: BigInt(agent.id),
      periodLabel: periodLabelNum,
      startingBalance,
      blindingStart: startingBlinding,
      endingBalance: agent.balance,
      blindingEnd: agent.blinding,
    });

    const result = await chain.verifyAttestation(
      this.contractId,
      agent.id,
      { maxSpend: maxSpendClaim, periodLabel: Number(periodLabelNum) },
      proof.toString("hex")
    );

    const verifyToken = Array.from({ length: 16 }, () =>
      "0123456789abcdef"[Math.floor(Math.random() * 16)]
    ).join("");
    const attestation: Attestation = {
      agentId: agent.id,
      agentName: agent.name,
      periodLabel,
      periodType: period,
      periodStartTimestamp,
      periodClamped,
      maxSpendClaim,
      vendorComplianceOk: true,
      startingCommitment: fieldToHex(startingCommitment),
      endingCommitment: fieldToHex(endingCommitment),
      proofBytes: proof.length,
      txHash: result.txHash,
      explorerUrl: explorerUrl(result.txHash),
      verifyToken,
      generatedAt: new Date().toISOString(),
      contractId: this.contractId,
    };
    this.attestations.set(verifyToken, attestation);
    return attestation;
  }

  summary() {
    const verified = this.events.filter((e) => e.status === "verified").length;
    const rejected = this.events.filter((e) => e.status === "rejected").length;
    return { settled: verified, violationsReachedSettlement: 0, rejected, total: this.events.length };
  }
}

function extractNoirAssertionFailure(stderrText: string): string {
  const m = stderrText.match(/error: Failed constraint[\s\S]{0,200}/);
  return m ? m[0].trim() : "circuit constraint not satisfied";
}
