import {
  VendorAllowlist,
  recomputeRoot,
  vendorIdFromName,
  balanceCommitment,
  fieldToHex,
  merkleParent,
} from "./poseidon.js";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "OK" : "FAIL"}: ${label}`);
  if (!pass) failures++;
}

const vendors = [
  "aws-compute",
  "stripe-payments",
  "twilio-communications",
  "sendgrid-email",
  "cloudflare-cdn",
  "anthropic-api",
  "openai-api",
  "datadog-monitoring",
].map(vendorIdFromName);
const allowlist = new VendorAllowlist(vendors);

for (const v of vendors) {
  const proof = allowlist.proofFor(v);
  const recomputed = recomputeRoot(proof);
  check(`vendor ${v} merkle proof recomputes to the allow-list root`, recomputed === allowlist.root);
}

const c1 = balanceCommitment(50000n, 12345n, 1n);
const c2 = balanceCommitment(50000n, 12345n, 1n);
check("balanceCommitment deterministic", c1 === c2);

// Cross-check against ACTUAL output from a real `nargo test --show-output`
// run of aegis-circuit's poseidon::poseidon::bn254::hash_3/hash_2 calls
// (the values baked into aegis-circuit/Prover.toml and re-derived live
// while building this project -- not invented). If this ever fails, it
// means poseidon-lite has diverged from the real Noir circuit's hash and
// every commitment the orchestrator computes would silently stop matching
// what's provable/verifiable on-chain.
const REAL_OLD_BALANCE_COMMITMENT = "0x15110425e7b17b5d67dd8ac39dfc1975a67dca9794502d451246b7efb91133c7";
const REAL_NEW_BALANCE_COMMITMENT = "0x2c7d1c68480a22c52a42d5b2658bba0bcd5433e5cab357006fc404dc7b137838";
// Depth-3 fixture, from test_valid_spend in aegis-circuit/src/main.nr:
// hash_1 = hash_2([42, 100]), hash_2 = hash_2([200, hash_1]), root = hash_2([hash_2, 300]).
// Re-derived live via `nargo test debug_print_depth3_root --show-output` against
// the real circuit, not invented -- see session notes.
const REAL_MERKLE_HASH_1 = "0x013f85b7cf992c496d699a1cf7d6aad4ac760b41122849182bd1d7008f757612";
const REAL_MERKLE_HASH_2 = "0x2e02bfabed8729801e059b49bac68cdc8b2fc2f2cb326f6a01fc8a38f55d91b0";
const REAL_VENDOR_ALLOWLIST_ROOT = "0x0f2320ab0f90841218f7cc23b5f089989b7011b926ac7e7f240df09a057ebf25";

const oldCommitment = balanceCommitment(50000n, 12345n, 1n);
check(
  "balanceCommitment(50000, 12345, 1) matches the real circuit's old_balance_commitment",
  fieldToHex(oldCommitment) === REAL_OLD_BALANCE_COMMITMENT
);

const newCommitment = balanceCommitment(49600n, 67890n, 1n);
check(
  "balanceCommitment(49600, 67890, 1) matches the real circuit's new_balance_commitment",
  fieldToHex(newCommitment) === REAL_NEW_BALANCE_COMMITMENT
);

// Reconstructed the same way aegis-circuit's test_valid_spend root is built
// (an arbitrary, non-canonical tree position, not VendorAllowlist's canonical
// layout, since that's how the circuit's own test fixture happens to be
// shaped): hash_1 = hash_2([42, 100]), hash_2 = hash_2([200, hash_1]),
// root = hash_2([hash_2, 300]).
const hash1 = merkleParent(42n, 100n);
check("merkleParent hash_1 matches real circuit output", fieldToHex(hash1) === REAL_MERKLE_HASH_1);
const hash2 = merkleParent(200n, hash1);
check("merkleParent hash_2 matches real circuit output", fieldToHex(hash2) === REAL_MERKLE_HASH_2);
const root = merkleParent(hash2, 300n);
check(
  "merkleParent chain matches the real circuit's depth-3 vendor_allowlist_root fixture",
  fieldToHex(root) === REAL_VENDOR_ALLOWLIST_ROOT
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll poseidon/merkle self-checks passed.");
