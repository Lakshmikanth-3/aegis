
// Aegis Circuit: spend_proof
// Proves an agent's payment is compliant without revealing amount or vendor.
//
// agent_nonce is a public input, not a private one: the contract reads the
// agent's on-chain nonce and requires this proof to be built against that
// exact value, then increments it on success. That's what makes a proof
// non-replayable -- a captured proof+public-input pair can't be resubmitted
// once the nonce has moved on.
fn main(
    old_balance_commitment: pub Field,
    new_balance_commitment: pub Field,
    per_tx_cap: pub u64,
    vendor_allowlist_root: pub Field,
    agent_id: pub Field,
    agent_nonce: pub Field,

    old_balance: u64,
    blinding_old: Field,
    amount: u64,
    new_balance: u64,
    blinding_new: Field,
    vendor_leaf: Field,
    merkle_path: [Field; 3],
    merkle_indices: [Field; 3]
) {
    let calculated_old_commitment = poseidon::poseidon::bn254::hash_3([old_balance as Field, blinding_old, agent_id]);
    assert(calculated_old_commitment == old_balance_commitment);

    assert(old_balance >= amount);
    assert(new_balance == old_balance - amount);
    assert(amount <= per_tx_cap);

    let calculated_new_commitment = poseidon::poseidon::bn254::hash_3([new_balance as Field, blinding_new, agent_id]);
    assert(calculated_new_commitment == new_balance_commitment);

    // Depth-3 Merkle tree over up to 8 vendor leaves.
    let mut current_hash = vendor_leaf;
    for i in 0..3 {
        let left = (1 - merkle_indices[i]) * current_hash + merkle_indices[i] * merkle_path[i];
        let right = merkle_indices[i] * current_hash + (1 - merkle_indices[i]) * merkle_path[i];
        current_hash = poseidon::poseidon::bn254::hash_2([left, right]);
    }
    assert(current_hash == vendor_allowlist_root);

    // agent_nonce carries no in-circuit constraint of its own: it only needs
    // to be a public input so the on-chain verifier call binds the proof to
    // a specific nonce value, which the contract compares against its
    // stored state before accepting the spend. Referencing it in an assert
    // that's always true keeps it from being flagged as an unused parameter.
    assert(agent_nonce == agent_nonce);
}

#[test]
fn test_valid_spend() {
    let old_balance: u64 = 50000;
    let blinding_old: Field = 12345;
    let agent_id: Field = 1;
    let agent_nonce: Field = 0;
    let old_balance_commitment = poseidon::poseidon::bn254::hash_3([old_balance as Field, blinding_old, agent_id]);

    let amount: u64 = 400;
    let per_tx_cap: u64 = 500;
    let new_balance: u64 = 49600;
    let blinding_new: Field = 67890;
    let new_balance_commitment = poseidon::poseidon::bn254::hash_3([new_balance as Field, blinding_new, agent_id]);

    let vendor_leaf: Field = 42;
    let path_0 = 100;
    let idx_0 = 0;
    let hash_1 = poseidon::poseidon::bn254::hash_2([vendor_leaf, path_0]);

    let path_1 = 200;
    let idx_1 = 1;
    let hash_2 = poseidon::poseidon::bn254::hash_2([path_1, hash_1]);

    let path_2 = 300;
    let idx_2 = 0;
    let root = poseidon::poseidon::bn254::hash_2([hash_2, path_2]);

    main(
        old_balance_commitment, new_balance_commitment, per_tx_cap, root, agent_id, agent_nonce,
        old_balance, blinding_old, amount, new_balance, blinding_new,
        vendor_leaf, [path_0, path_1, path_2], [idx_0, idx_1, idx_2]
    );
}

#[test(should_fail)]
fn test_invalid_spend_over_cap() {
    let old_balance: u64 = 50000;
    let blinding_old: Field = 12345;
    let agent_id: Field = 1;
    let agent_nonce: Field = 0;
    let old_balance_commitment = poseidon::poseidon::bn254::hash_3([old_balance as Field, blinding_old, agent_id]);

    let amount: u64 = 600; // Over cap!
    let per_tx_cap: u64 = 500;
    let new_balance: u64 = 49400;
    let blinding_new: Field = 67890;
    let new_balance_commitment = poseidon::poseidon::bn254::hash_3([new_balance as Field, blinding_new, agent_id]);

    let vendor_leaf: Field = 42;
    let path_0 = 100;
    let idx_0 = 0;
    let hash_1 = poseidon::poseidon::bn254::hash_2([vendor_leaf, path_0]);

    let path_1 = 200;
    let idx_1 = 1;
    let hash_2 = poseidon::poseidon::bn254::hash_2([path_1, hash_1]);

    let path_2 = 300;
    let idx_2 = 0;
    let root = poseidon::poseidon::bn254::hash_2([hash_2, path_2]);

    main(
        old_balance_commitment, new_balance_commitment, per_tx_cap, root, agent_id, agent_nonce,
        old_balance, blinding_old, amount, new_balance, blinding_new,
        vendor_leaf, [path_0, path_1, path_2], [idx_0, idx_1, idx_2]
    );
}

#[test(should_fail)]
fn test_invalid_spend_wrong_vendor() {
    let old_balance: u64 = 50000;
    let blinding_old: Field = 12345;
    let agent_id: Field = 1;
    let agent_nonce: Field = 0;
    let old_balance_commitment = poseidon::poseidon::bn254::hash_3([old_balance as Field, blinding_old, agent_id]);

    let amount: u64 = 400;
    let per_tx_cap: u64 = 500;
    let new_balance: u64 = 49600;
    let blinding_new: Field = 67890;
    let new_balance_commitment = poseidon::poseidon::bn254::hash_3([new_balance as Field, blinding_new, agent_id]);

    // Fixed allow-list root built from the real leaf (42), matching
    // test_valid_spend -- NOT recomputed from vendor_leaf below, otherwise
    // this test would trivially "pass" verification for any leaf.
    let path_0 = 100;
    let hash_1_real = poseidon::poseidon::bn254::hash_2([42, path_0]);
    let path_1 = 200;
    let hash_2_real = poseidon::poseidon::bn254::hash_2([path_1, hash_1_real]);
    let path_2 = 300;
    let root = poseidon::poseidon::bn254::hash_2([hash_2_real, path_2]);

    // Vendor leaf not actually in the tree the root above was built from.
    let vendor_leaf: Field = 999;
    let idx_0 = 0;
    let idx_1 = 1;
    let idx_2 = 0;

    main(
        old_balance_commitment, new_balance_commitment, per_tx_cap, root, agent_id, agent_nonce,
        old_balance, blinding_old, amount, new_balance, blinding_new,
        vendor_leaf, [path_0, path_1, path_2], [idx_0, idx_1, idx_2]
    );
}
