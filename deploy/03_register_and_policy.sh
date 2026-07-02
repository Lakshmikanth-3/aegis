#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=$(cat /mnt/c/hack/ZK/deploy/contract_id.txt)
ROOT_HEX="2e02bfabed8729801e059b49bac68cdc8b2fc2f2cb326f6a01fc8a38f55d91b0"
OLD_COMMITMENT_HEX="15110425e7b17b5d67dd8ac39dfc1975a67dca9794502d451246b7efb91133c7"

echo "=== register_agent ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- \
  register_agent --admin aegis-admin --agent_id 1 --initial_commitment "$OLD_COMMITMENT_HEX"

echo "=== update_policy ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- \
  update_policy --admin aegis-admin --per_tx_cap 500 --new_allowlist_root "$ROOT_HEX"
