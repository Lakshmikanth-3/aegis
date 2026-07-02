#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=$(cat /mnt/c/hack/ZK/deploy/contract_id.txt)
PROOF_HEX=$(xxd -p /mnt/c/hack/ZK/aegis-circuit/target/proof | tr -d '\n')
echo "proof hex length: ${#PROOF_HEX}"

PUBLIC_INPUTS='{ "agent_id": 1, "agent_nonce": 0, "new_balance_commitment": "2c7d1c68480a22c52a42d5b2658bba0bcd5433e5cab357006fc404dc7b137838", "old_balance_commitment": "15110425e7b17b5d67dd8ac39dfc1975a67dca9794502d451246b7efb91133c7", "per_tx_cap": 500, "vendor_allowlist_root": "2e02bfabed8729801e059b49bac68cdc8b2fc2f2cb326f6a01fc8a38f55d91b0" }'

stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- \
  submit_spend --agent_id 1 --proof "$PROOF_HEX" --public_inputs "$PUBLIC_INPUTS"
