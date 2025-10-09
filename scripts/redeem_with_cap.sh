#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/redeem_with_cap.sh <RUSD_AMOUNT> <RECEIVER> <MAX_APR_PERCENT> <PREFER_LARGER_DEBT>
# Example: scripts/redeem_with_cap.sh 1000 0xYourAddr 3.0 true

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <RUSD_AMOUNT> <RECEIVER> <MAX_APR_PERCENT> <PREFER_LARGER_DEBT>" >&2
  exit 1
fi

RUSD_AMOUNT=$1
RECEIVER=$2
MAX_APR_PERCENT=$3
PREFER_LARGER=${4,,}

if [[ -z "${RPC_URL:-}" || -z "${PRIVATE_KEY:-}" || -z "${VAULT_MANAGER_ADDRESS:-}" ]]; then
  echo "Please export RPC_URL, PRIVATE_KEY, and VAULT_MANAGER_ADDRESS env vars." >&2
  exit 1
fi

# Convert inputs
RUSD_WEI=$(cast --to-wei "$RUSD_AMOUNT" ether)

# Convert percent to wad (e.g., 3.0% -> 0.03e18)
MAX_APR_DEC=$(python3 - <<PY
print(str(float("$MAX_APR_PERCENT")/100.0))
PY
)
MAX_APR_WAD=$(cast --to-uint256 $(python3 - <<PY
from decimal import Decimal
print(int(Decimal("$MAX_APR_DEC") * (10**18)))
PY
))

BOOL_ARG=false
if [[ "$PREFER_LARGER" == "true" || "$PREFER_LARGER" == "1" ]]; then
  BOOL_ARG=true
fi

echo "Redeeming $RUSD_AMOUNT crdUSD to $RECEIVER with cap ${MAX_APR_PERCENT}% and preferLargerDebt=$BOOL_ARG"

cast send "$VAULT_MANAGER_ADDRESS" \
  "redeemAdvanced(uint256,address,uint256,bool)" \
  "$RUSD_WEI" "$RECEIVER" "$MAX_APR_WAD" "$BOOL_ARG" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"

