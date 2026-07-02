#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=CBHVMJFDTHMRY54VOU2ZZ3U65F2XWORRVCHINK2UY7V4L5FHCSIHYRWA
echo "=== Contract on stellar.expert ==="
echo "https://stellar.expert/explorer/testnet/contract/$CID"
echo "=== get_commitment agent 1 (research-bot-1) ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_commitment --agent_id 1
echo "=== get_nonce agent 1 ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_nonce --agent_id 1
echo "=== get_commitment agent 2 (research-bot-2) ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_commitment --agent_id 2
echo "=== get_nonce agent 2 ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_nonce --agent_id 2
echo "=== get_commitment agent 3 (ops-bot-3) ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_commitment --agent_id 3
echo "=== get_nonce agent 3 ==="
stellar contract invoke --id "$CID" --source aegis-admin --network testnet --send=no -- get_nonce --agent_id 3
