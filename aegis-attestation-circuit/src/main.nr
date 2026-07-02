
// Aegis Circuit: compliance_attestation (Wow #2 / Section 7.3 of the PRD)
//
// This is the simplified, PRD-endorsed fallback rather than the full
// "sum of per-payment amounts + per-payment vendor membership" version:
// it proves cumulative spend over a period from just the two balance
// commitments that bookend it, instead of replaying every payment in the
// period. Same commitment scheme as spend_proof, so it composes with the
// same on-chain state -- the contract just needs to remember the
// commitment that was current when the period started.
//
// Vendor-compliance is NOT re-proven here: every payment in the account
// model already had its vendor membership checked at submit_spend time
// by spend_proof, so by the time a balance reaches `ending_commitment`
// it can only be the result of allow-listed spends. Re-deriving that
// fact from scratch (the original 7.3 "every vendor_leaf used was in the
// allow-list" version) would require iterating per-payment history,
// which the account model intentionally doesn't keep on-chain.
fn main(
    starting_commitment: pub Field,
    ending_commitment: pub Field,
    max_spend: pub u64,
    agent_id: pub Field,
    period_label: pub Field,

    starting_balance: u64,
    blinding_start: Field,
    ending_balance: u64,
    blinding_end: Field,
) {
    let calculated_start = poseidon::poseidon::bn254::hash_3([starting_balance as Field, blinding_start, agent_id]);
    assert(calculated_start == starting_commitment);

    let calculated_end = poseidon::poseidon::bn254::hash_3([ending_balance as Field, blinding_end, agent_id]);
    assert(calculated_end == ending_commitment);

    // The account model only ever decreases balance via a verified spend,
    // so a well-formed period always has ending <= starting.
    assert(ending_balance <= starting_balance);

    let cumulative_spend = starting_balance - ending_balance;
    assert(cumulative_spend <= max_spend);

    // period_label carries no in-circuit constraint -- it only needs to be
    // a public input so the proof is bound to a specific reporting period
    // (e.g. "Q2-2026") and can't be silently reused to attest a different
    // one.
    assert(period_label == period_label);
}

#[test]
fn test_valid_attestation() {
    let agent_id: Field = 1;
    let period_label: Field = 2026_02; // stand-in for a hashed "Q2-2026" label

    let starting_balance: u64 = 50000;
    let blinding_start: Field = 111;
    let starting_commitment = poseidon::poseidon::bn254::hash_3([starting_balance as Field, blinding_start, agent_id]);

    let ending_balance: u64 = 38000;
    let blinding_end: Field = 222;
    let ending_commitment = poseidon::poseidon::bn254::hash_3([ending_balance as Field, blinding_end, agent_id]);

    let max_spend: u64 = 12000; // actual spend is exactly 12000

    main(
        starting_commitment, ending_commitment, max_spend, agent_id, period_label,
        starting_balance, blinding_start, ending_balance, blinding_end,
    );
}

#[test(should_fail)]
fn test_attestation_fails_when_spend_exceeds_claim() {
    let agent_id: Field = 1;
    let period_label: Field = 2026_02;

    let starting_balance: u64 = 50000;
    let blinding_start: Field = 111;
    let starting_commitment = poseidon::poseidon::bn254::hash_3([starting_balance as Field, blinding_start, agent_id]);

    let ending_balance: u64 = 30000; // actual spend is 20000
    let blinding_end: Field = 222;
    let ending_commitment = poseidon::poseidon::bn254::hash_3([ending_balance as Field, blinding_end, agent_id]);

    let max_spend: u64 = 12000; // claiming spend stayed under 12000 -- false

    main(
        starting_commitment, ending_commitment, max_spend, agent_id, period_label,
        starting_balance, blinding_start, ending_balance, blinding_end,
    );
}

#[test(should_fail)]
fn test_attestation_fails_on_wrong_starting_commitment() {
    let agent_id: Field = 1;
    let period_label: Field = 2026_02;

    let starting_balance: u64 = 50000;
    let blinding_start: Field = 111;
    // Commitment built with a different agent_id than the one passed to main.
    let wrong_starting_commitment = poseidon::poseidon::bn254::hash_3([starting_balance as Field, blinding_start, 999]);

    let ending_balance: u64 = 40000;
    let blinding_end: Field = 222;
    let ending_commitment = poseidon::poseidon::bn254::hash_3([ending_balance as Field, blinding_end, agent_id]);

    let max_spend: u64 = 12000;

    main(
        wrong_starting_commitment, ending_commitment, max_spend, agent_id, period_label,
        starting_balance, blinding_start, ending_balance, blinding_end,
    );
}
