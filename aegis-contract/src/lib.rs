#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env,
};
use ultrahonk_soroban_verifier::UltraHonkVerifier;

#[contractevent(topics = ["authorized_spend"], data_format = "map")]
pub struct AuthorizedSpendEvent<'a> {
    #[topic]
    pub agent_id: &'a u64,
    pub new_balance_commitment: &'a BytesN<32>,
}

#[contractevent(topics = ["attestation_verified"], data_format = "map")]
pub struct AttestationVerifiedEvent<'a> {
    #[topic]
    pub agent_id: &'a u64,
    pub period_label: &'a u64,
    pub max_spend: &'a u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    VendorAllowlistRoot,
    PerTxCap,
    VerificationKey,
    AttestationVerificationKey,
    AgentCommitment(u64),       // agent_id -> BytesN<32>
    AgentNonce(u64),            // agent_id -> u64
    PeriodStartCommitment(u64), // agent_id -> BytesN<32>, snapshot at start_attestation_period
}

/// Mirrors the public inputs of the `spend_proof` Noir circuit
/// (aegis-circuit/src/main.nr), in the exact declaration order the circuit
/// lists them in. The verifier has no notion of field names -- it only sees
/// a flat run of 32-byte big-endian field elements, so this order is load
/// bearing: get it wrong and every proof fails to verify even though the
/// underlying circuit logic is sound.
#[contracttype]
pub struct SpendPublicInputs {
    pub old_balance_commitment: BytesN<32>,
    pub new_balance_commitment: BytesN<32>,
    pub per_tx_cap: u64,
    pub vendor_allowlist_root: BytesN<32>,
    pub agent_id: u64,
    pub agent_nonce: u64,
}

/// Mirrors the public inputs of the `compliance_attestation` Noir circuit
/// (aegis-attestation-circuit/src/main.nr), in declaration order:
/// starting_commitment, ending_commitment, max_spend, agent_id,
/// period_label. `starting_commitment` and `ending_commitment` are not
/// taken on faith from the caller -- `verify_attestation` overwrites them
/// with the contract's own stored values before verifying, so the only
/// caller-supplied claim a proof can actually attest to is `max_spend`
/// for the given `period_label`.
#[contracttype]
pub struct AttestationClaim {
    pub max_spend: u64,
    pub period_label: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    AllowlistRootMismatch = 2,
    PerTxCapMismatch = 3,
    StaleCommitment = 4,
    NonceMismatch = 5,
    VkLoadFailed = 6,
    VerificationFailed = 7,
    AgentNotRegistered = 8,
    AttestationVkLoadFailed = 9,
    NoPeriodStarted = 10,
    AttestationVerificationFailed = 11,
}

#[contract]
pub struct AegisTreasury;

#[contractimpl]
impl AegisTreasury {
    pub fn init(env: Env, admin: Address, vendor_allowlist_root: BytesN<32>, vk_bytes: Bytes) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VendorAllowlistRoot, &vendor_allowlist_root);
        env.storage()
            .instance()
            .set(&DataKey::VerificationKey, &vk_bytes);
    }

    pub fn register_agent(
        env: Env,
        admin: Address,
        agent_id: u64,
        initial_commitment: BytesN<32>,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        env.storage()
            .persistent()
            .set(&DataKey::AgentCommitment(agent_id), &initial_commitment);
        env.storage()
            .persistent()
            .set(&DataKey::AgentNonce(agent_id), &0u64);
        Ok(())
    }

    pub fn update_policy(
        env: Env,
        admin: Address,
        per_tx_cap: u64,
        new_allowlist_root: BytesN<32>,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        env.storage().instance().set(&DataKey::PerTxCap, &per_tx_cap);
        env.storage()
            .instance()
            .set(&DataKey::VendorAllowlistRoot, &new_allowlist_root);
        Ok(())
    }

    /// Installs the verification key for the (separate) `compliance_attestation`
    /// circuit. Kept apart from `init`'s `spend_proof` VK because the two
    /// circuits are different shapes and may be deployed at different times
    /// (attestation is a stretch feature, per the PRD).
    pub fn init_attestation_vk(env: Env, admin: Address, vk_bytes: Bytes) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::AttestationVerificationKey, &vk_bytes);
        Ok(())
    }

    /// Snapshots an agent's current shielded-balance commitment as the
    /// start of a new reporting period. A `compliance_attestation` proof
    /// generated after this call attests to cumulative spend between this
    /// snapshot and the agent's commitment at attestation time.
    pub fn start_attestation_period(env: Env, admin: Address, agent_id: u64) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let current_commitment: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::AgentCommitment(agent_id))
            .ok_or(Error::AgentNotRegistered)?;
        env.storage()
            .persistent()
            .set(&DataKey::PeriodStartCommitment(agent_id), &current_commitment);
        Ok(())
    }

    /// Directly sets an agent's attestation period-start commitment to a
    /// caller-supplied value, rather than snapshotting the agent's current
    /// commitment (which is all `start_attestation_period` can do). This is
    /// what lets the orchestrator attest against a real *historical*
    /// window (e.g. "last 24 hours") instead of only "since the last time
    /// someone clicked start": the orchestrator retains the actual
    /// (balance, blinding) pair it used at that past point in time, so it
    /// can still construct a genuine proof against whatever commitment is
    /// set here -- this method doesn't let anyone fabricate a fact, it
    /// only lets the admin point at which real past commitment the next
    /// attestation proof is measured from.
    pub fn set_period_start_commitment(
        env: Env,
        admin: Address,
        agent_id: u64,
        commitment: BytesN<32>,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage()
            .persistent()
            .set(&DataKey::PeriodStartCommitment(agent_id), &commitment);
        Ok(())
    }

    /// Verifies a `compliance_attestation` proof that the agent's
    /// cumulative spend since `start_attestation_period` was called is
    /// `<= claim.max_spend`. The starting/ending commitments are read from
    /// contract state, not taken from the caller, so a verified proof is a
    /// real on-chain fact about this specific agent and period -- not just
    /// a claim the caller typed in.
    pub fn verify_attestation(
        env: Env,
        agent_id: u64,
        claim: AttestationClaim,
        proof: Bytes,
    ) -> Result<bool, Error> {
        let starting_commitment: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::PeriodStartCommitment(agent_id))
            .ok_or(Error::NoPeriodStarted)?;
        let ending_commitment: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::AgentCommitment(agent_id))
            .ok_or(Error::AgentNotRegistered)?;

        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::AttestationVerificationKey)
            .ok_or(Error::AttestationVkLoadFailed)?;
        let verifier =
            UltraHonkVerifier::new(&env, &vk_bytes).map_err(|_| Error::AttestationVkLoadFailed)?;

        let public_inputs_bytes = serialize_attestation_inputs(
            &env,
            &starting_commitment,
            &ending_commitment,
            &claim,
            agent_id,
        );
        verifier
            .verify(&env, &proof, &public_inputs_bytes)
            .map_err(|_| Error::AttestationVerificationFailed)?;

        AttestationVerifiedEvent {
            agent_id: &agent_id,
            period_label: &claim.period_label,
            max_spend: &claim.max_spend,
        }
        .publish(&env);

        Ok(true)
    }

    /// Verifies an UltraHonk `spend_proof` and, on success, advances the
    /// agent's shielded balance commitment and nonce. This is the only path
    /// by which an agent's commitment changes -- there is deliberately no
    /// "set balance" admin escape hatch, since that would defeat the point
    /// of the proof.
    pub fn submit_spend(
        env: Env,
        agent_id: u64,
        proof: Bytes,
        public_inputs: SpendPublicInputs,
    ) -> Result<bool, Error> {
        // 1. Policy parameters in the proof must match on-chain state --
        //    otherwise an agent could reuse a proof built against a stale
        //    (looser) cap or allow-list root after the admin tightened it.
        let stored_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::VendorAllowlistRoot)
            .ok_or(Error::AgentNotRegistered)?;
        let stored_cap: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PerTxCap)
            .ok_or(Error::AgentNotRegistered)?;
        if public_inputs.vendor_allowlist_root != stored_root {
            return Err(Error::AllowlistRootMismatch);
        }
        if public_inputs.per_tx_cap != stored_cap {
            return Err(Error::PerTxCapMismatch);
        }

        // 2. The proof must be built against the agent's current commitment
        //    and current nonce -- this is the replay-protection check.
        let current_commitment: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::AgentCommitment(agent_id))
            .ok_or(Error::AgentNotRegistered)?;
        if public_inputs.old_balance_commitment != current_commitment {
            return Err(Error::StaleCommitment);
        }
        let current_nonce: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::AgentNonce(agent_id))
            .unwrap_or(0);
        if public_inputs.agent_nonce != current_nonce {
            return Err(Error::NonceMismatch);
        }

        // 3. Verify the UltraHonk proof via the real rs-soroban-ultrahonk
        //    verifier, which uses Protocol 26 (CAP-80) BN254 host functions.
        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::VerificationKey)
            .ok_or(Error::VkLoadFailed)?;
        let verifier =
            UltraHonkVerifier::new(&env, &vk_bytes).map_err(|_| Error::VkLoadFailed)?;

        let public_inputs_bytes = serialize_public_inputs(&env, &public_inputs);
        verifier
            .verify(&env, &proof, &public_inputs_bytes)
            .map_err(|_| Error::VerificationFailed)?;

        // 4. Update state on success.
        env.storage()
            .persistent()
            .set(&DataKey::AgentCommitment(agent_id), &public_inputs.new_balance_commitment);
        env.storage()
            .persistent()
            .set(&DataKey::AgentNonce(agent_id), &(current_nonce + 1));

        // 5. Emit AuthorizedSpend event.
        AuthorizedSpendEvent {
            agent_id: &agent_id,
            new_balance_commitment: &public_inputs.new_balance_commitment,
        }
        .publish(&env);

        Ok(true)
    }

    pub fn get_commitment(env: Env, agent_id: u64) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::AgentCommitment(agent_id))
    }

    pub fn get_nonce(env: Env, agent_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::AgentNonce(agent_id))
            .unwrap_or(0)
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::Unauthorized)?;
        if *caller != stored_admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }
}

/// Serializes the circuit's public inputs into the flat, 32-byte-per-
/// field-element layout `UltraHonkVerifier::verify` expects, in the
/// exact order they're declared as `pub` parameters in
/// aegis-circuit/src/main.nr: old_balance_commitment,
/// new_balance_commitment, per_tx_cap, vendor_allowlist_root, agent_id,
/// agent_nonce.
///
/// Deliberately a plain function (not a `#[contractimpl]` method) so it's
/// neither a separate invokable contract entrypoint nor invisible outside
/// the crate -- `tests/real_proof.rs` calls it directly to confirm it
/// reproduces `bb`'s real public_inputs byte layout exactly.
pub fn serialize_public_inputs(env: &Env, inputs: &SpendPublicInputs) -> Bytes {
    let mut out = Bytes::new(env);
    out.append(&Bytes::from(inputs.old_balance_commitment.clone()));
    out.append(&Bytes::from(inputs.new_balance_commitment.clone()));
    out.extend_from_slice(&u64_to_be_field(inputs.per_tx_cap));
    out.append(&Bytes::from(inputs.vendor_allowlist_root.clone()));
    out.extend_from_slice(&u64_to_be_field(inputs.agent_id));
    out.extend_from_slice(&u64_to_be_field(inputs.agent_nonce));
    out
}

/// Serializes the `compliance_attestation` circuit's public inputs in its
/// declared order: starting_commitment, ending_commitment, max_spend,
/// agent_id, period_label. See `serialize_public_inputs` for why this is a
/// plain function.
pub fn serialize_attestation_inputs(
    env: &Env,
    starting_commitment: &BytesN<32>,
    ending_commitment: &BytesN<32>,
    claim: &AttestationClaim,
    agent_id: u64,
) -> Bytes {
    let mut out = Bytes::new(env);
    out.append(&Bytes::from(starting_commitment.clone()));
    out.append(&Bytes::from(ending_commitment.clone()));
    out.extend_from_slice(&u64_to_be_field(claim.max_spend));
    out.extend_from_slice(&u64_to_be_field(agent_id));
    out.extend_from_slice(&u64_to_be_field(claim.period_label));
    out
}

/// Right-aligns a u64 into a 32-byte big-endian field element, matching how
/// Noir represents integer-typed `pub` parameters (cast to `Field`) in its
/// public-inputs witness vector.
fn u64_to_be_field(x: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&x.to_be_bytes());
    out
}

#[cfg(test)]
mod test;
