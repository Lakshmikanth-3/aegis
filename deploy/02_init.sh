#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
CID=$(cat /mnt/c/hack/ZK/deploy/contract_id.txt)
VK_HEX=$(xxd -p /mnt/c/hack/ZK/aegis-circuit/target/vk | tr -d '\n')
ROOT_HEX="2e02bfabed8729801e059b49bac68cdc8b2fc2f2cb326f6a01fc8a38f55d91b0"
echo "vk hex length: ${#VK_HEX}"
echo "root hex length: ${#ROOT_HEX}"

stellar contract invoke --id "$CID" --source aegis-admin --network testnet -- \
  init --admin aegis-admin --vendor_allowlist_root "$ROOT_HEX" --vk_bytes "$VK_HEX"
