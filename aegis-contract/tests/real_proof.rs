//! Integration test against a REAL UltraHonk proof, generated outside this
//! Rust crate entirely: `nargo execute` + `bb prove`/`write_vk` (Noir
//! 1.0.0-beta.9, bb v0.87.0 -- the exact toolchain rs-soroban-ultrahonk's
//! own circuits/scripts/build_one.sh pins, for proof-format compatibility)
//! against aegis-circuit/src/main.nr with the concrete inputs recorded in
//! aegis-circuit/Prover.toml. No mocked proof bytes anywhere in this file.
//!
//! This is the test that actually exercises submit_spend's accept path --
//! the one earlier unit tests (src/test.rs) explicitly could not reach for
//! lack of a real proof.
//!
//! The artifacts are read from fixtures/spend_proof/, a copy made right
//! after generating them, NOT from aegis-circuit/target/ directly -- the
//! orchestrator (orchestrator/src/prover.ts) overwrites that directory's
//! Prover.toml/target/* on every real payment it proves for the live
//! dashboard demo, so a fixed copy is the only way this test stays
//! reproducible.

use aegis_treasury::{
    serialize_public_inputs, AegisTreasury, AegisTreasuryClient, Error, SpendPublicInputs,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, BytesN, Env};

const PROOF: &[u8] = include_bytes!("../fixtures/spend_proof/proof");
const VK: &[u8] = include_bytes!("../fixtures/spend_proof/vk");
const PUBLIC_INPUTS: &[u8] = include_bytes!("../fixtures/spend_proof/public_inputs");

fn field(i: usize) -> [u8; 32] {
    PUBLIC_INPUTS[i * 32..(i + 1) * 32].try_into().unwrap()
}

fn u64_from_be_field(bytes: [u8; 32]) -> u64 {
    u64::from_be_bytes(bytes[24..32].try_into().unwrap())
}

#[test]
fn submit_spend_accepts_a_real_proof() {
    assert_eq!(PUBLIC_INPUTS.len(), 192, "expected 6 public Field elements (32 bytes each)");

    // Decode the real public_inputs file written by `bb prove`, in the
    // exact order aegis-circuit/src/main.nr declares its `pub` params:
    // old_balance_commitment, new_balance_commitment, per_tx_cap,
    // vendor_allowlist_root, agent_id, agent_nonce.
    let old_balance_commitment = field(0);
    let new_balance_commitment = field(1);
    let per_tx_cap = u64_from_be_field(field(2));
    let vendor_allowlist_root = field(3);
    let agent_id = u64_from_be_field(field(4));
    let agent_nonce = u64_from_be_field(field(5));

    // Sanity-check against Prover.toml's plaintext values, so a future
    // edit to Prover.toml that isn't followed by regenerating target/
    // fails loudly here instead of silently testing stale artifacts.
    assert_eq!(per_tx_cap, 500);
    assert_eq!(agent_id, 1);
    assert_eq!(agent_nonce, 0);

    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AegisTreasury, ());
    let client = AegisTreasuryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let root_bn = BytesN::from_array(&env, &vendor_allowlist_root);
    client.init(&admin, &root_bn, &Bytes::from_slice(&env, VK));
    client.update_policy(&admin, &per_tx_cap, &root_bn);
    client.register_agent(
        &admin,
        &agent_id,
        &BytesN::from_array(&env, &old_balance_commitment),
    );

    let inputs = SpendPublicInputs {
        old_balance_commitment: BytesN::from_array(&env, &old_balance_commitment),
        new_balance_commitment: BytesN::from_array(&env, &new_balance_commitment),
        per_tx_cap,
        vendor_allowlist_root: root_bn,
        agent_id,
        agent_nonce,
    };

    // The contract's own serializer must reproduce bb's exact public_inputs
    // byte layout -- this is the check that would have caught a
    // field-ordering bug even before reaching the verifier.
    let reserialized = serialize_public_inputs(&env, &inputs);
    assert_eq!(reserialized.to_alloc_vec(), PUBLIC_INPUTS.to_vec());

    let result = client.submit_spend(&agent_id, &Bytes::from_slice(&env, PROOF), &inputs);
    assert!(result, "real UltraHonk proof failed to verify on-chain");

    assert_eq!(
        client.get_commitment(&agent_id),
        Some(BytesN::from_array(&env, &new_balance_commitment))
    );
    assert_eq!(client.get_nonce(&agent_id), 1);

    // Replay attack: resubmit the exact same real proof + public inputs
    // that just succeeded. The stored commitment has already advanced
    // past old_balance_commitment (checked before the nonce, per
    // submit_spend's ordering), so this must be rejected before the
    // (still valid, still real) proof is even handed to the verifier --
    // otherwise a captured proof could be replayed to drain funds
    // indefinitely.
    let replay_result =
        client.try_submit_spend(&agent_id, &Bytes::from_slice(&env, PROOF), &inputs);
    assert_eq!(replay_result, Err(Ok(Error::StaleCommitment)));

    // State must be unchanged by the rejected replay.
    assert_eq!(
        client.get_commitment(&agent_id),
        Some(BytesN::from_array(&env, &new_balance_commitment))
    );
    assert_eq!(client.get_nonce(&agent_id), 1);
}
