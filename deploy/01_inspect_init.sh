#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=$(cat /mnt/c/hack/ZK/deploy/contract_id.txt)
stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- init --help
