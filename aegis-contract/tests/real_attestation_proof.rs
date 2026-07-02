//! Integration test against a REAL `compliance_attestation` UltraHonk
//! proof (same toolchain/process as tests/real_proof.rs): `nargo execute` +
//! `bb prove`/`write_vk` against aegis-attestation-circuit/src/main.nr with
//! the inputs in aegis-attestation-circuit/Prover.toml, which deliberately
//! reuses the exact starting/ending commitments from
//! aegis-circuit/Prover.toml's spend scenario -- so this attests to
//! cumulative spend across that one real, on-chain-verified spend.

use aegis_treasury::{
    serialize_attestation_inputs, AegisTreasury, AegisTreasuryClient, AttestationClaim,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, BytesN, Env};

// See tests/real_proof.rs's header comment: read from a fixed copy, not
// aegis-attestation-circuit/target/ directly, since the orchestrator
// overwrites that directory on every real attestation it proves live.
const PROOF: &[u8] = include_bytes!("../fixtures/compliance_attestation/proof");
const VK: &[u8] = include_bytes!("../fixtures/compliance_attestation/vk");
const PUBLIC_INPUTS: &[u8] = include_bytes!("../fixtures/compliance_attestation/public_inputs");

fn field(i: usize) -> [u8; 32] {
    PUBLIC_INPUTS[i * 32..(i + 1) * 32].try_into().unwrap()
}

fn u64_from_be_field(bytes: [u8; 32]) -> u64 {
    u64::from_be_bytes(bytes[24..32].try_into().unwrap())
}

#[test]
fn verify_attestation_accepts_a_real_proof() {
    assert_eq!(PUBLIC_INPUTS.len(), 160, "expected 5 public Field elements (32 bytes each)");

    // Order per aegis-attestation-circuit/src/main.nr: starting_commitment,
    // ending_commitment, max_spend, agent_id, period_label.
    let starting_commitment = field(0);
    let ending_commitment = field(1);
    let max_spend = u64_from_be_field(field(2));
    let agent_id = u64_from_be_field(field(3));
    let period_label = u64_from_be_field(field(4));

    assert_eq!(max_spend, 400);
    assert_eq!(agent_id, 1);
    assert_eq!(period_label, 202602);

    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AegisTreasury, ());
    let client = AegisTreasuryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let root = BytesN::from_array(&env, &[1u8; 32]);
    client.init(&admin, &root, &Bytes::from_array(&env, &[0u8; 16]));
    client.init_attestation_vk(&admin, &Bytes::from_slice(&env, VK));

    // Register the agent with the period's starting commitment, then
    // advance it on-chain to the ending commitment via the contract's own
    // start_attestation_period/state-write path (not by faking storage),
    // so verify_attestation reads real contract state, the same way
    // submit_spend would have left it after a real accepted spend.
    client.register_agent(
        &admin,
        &agent_id,
        &BytesN::from_array(&env, &starting_commitment),
    );
    client.start_attestation_period(&admin, &agent_id);

    // Advance the stored commitment to the period's ending value. This
    // contract has no "set commitment" admin method (by design -- see
    // submit_spend's doc comment), so for this test we write storage
    // directly to simulate "a submit_spend already moved the commitment
    // here", which is exactly what tests/real_proof.rs's accepted proof
    // really does in the matching end-to-end run.
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(
            &aegis_treasury::DataKey::AgentCommitment(agent_id),
            &BytesN::from_array(&env, &ending_commitment),
        );
    });

    let claim = AttestationClaim { max_spend, period_label };

    let reserialized = serialize_attestation_inputs(
        &env,
        &BytesN::from_array(&env, &starting_commitment),
        &BytesN::from_array(&env, &ending_commitment),
        &claim,
        agent_id,
    );
    assert_eq!(reserialized.to_alloc_vec(), PUBLIC_INPUTS.to_vec());

    let result =
        client.verify_attestation(&agent_id, &claim, &Bytes::from_slice(&env, PROOF));
    assert!(result, "real compliance_attestation proof failed to verify on-chain");
}
