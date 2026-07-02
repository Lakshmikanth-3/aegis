#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=$(cat /mnt/c/hack/ZK/deploy/contract_id.txt)
echo "=== get_commitment ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- get_commitment --agent_id 1
echo "=== get_nonce ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- get_nonce --agent_id 1
