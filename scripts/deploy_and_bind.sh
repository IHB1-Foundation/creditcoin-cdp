#!/usr/bin/env bash
set -euo pipefail

# One-shot deployment and frontend binding for Credit CDP
# - Deploys contracts via Foundry script
# - Parses broadcast output to capture addresses
# - Updates root .env and writes frontend/.env.local

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "[deploy_and_bind] Missing .env. Copy .env.example and configure it first." >&2
  exit 1
fi

# Load env (RPC_URL, CHAIN_ID, PRIVATE_KEY, optional explorer/name)
set -a
source .env
set +a

if [[ -z "${RPC_URL:-}" || -z "${CHAIN_ID:-}" || -z "${PRIVATE_KEY:-}" ]]; then
  echo "[deploy_and_bind] Ensure RPC_URL, CHAIN_ID and PRIVATE_KEY are set in .env" >&2
  exit 1
fi

SKIP_PREFLIGHT=${SKIP_PREFLIGHT:-false}

choose_rpc() {
  local base="$1"
  local candidates=("$base" "${base%/}/evm" "${base%/}/eth" "${base%/}/rpc")
  for url in "${candidates[@]}"; do
    if cast block-number --rpc-url "$url" >/dev/null 2>&1; then
      echo "$url"
      return 0
    fi
  done
  return 1
}

EFFECTIVE_RPC_URL="$RPC_URL"

if [[ "$SKIP_PREFLIGHT" != "true" && "$SKIP_PREFLIGHT" != "1" ]]; then
  echo "[deploy_and_bind] Preflight RPC check..."
  if EFFECTIVE_RPC_URL=$(choose_rpc "$RPC_URL"); then
    echo "[deploy_and_bind] RPC OK: $EFFECTIVE_RPC_URL"
  else
    echo "[deploy_and_bind] RPC check failed. Common causes:" >&2
    echo "  - RPC_URL is incorrect or not reachable" >&2
    echo "  - Endpoint is not an EVM JSON-RPC (some providers require a path like /evm)" >&2
    echo "  - CORS or auth required by provider" >&2
    echo "Tried: $RPC_URL, ${RPC_URL%/}/evm, ${RPC_URL%/}/eth, ${RPC_URL%/}/rpc" >&2
    echo "Manual test example:" >&2
    echo "  curl -s -H 'Content-Type: application/json' -X POST $RPC_URL \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'" >&2
    echo "Tip: set SKIP_PREFLIGHT=true to bypass this check (not recommended)." >&2
    exit 1
  fi
else
  echo "[deploy_and_bind] Skipping RPC preflight by request (SKIP_PREFLIGHT=$SKIP_PREFLIGHT)"
fi

echo "[deploy_and_bind] Building contracts..."
forge build > /dev/null

echo "[deploy_and_bind] Deploying via forge script to chain ${CHAIN_ID}..."

# Some RPC providers (or non-EIP1559 chains) don't support fee history or EIP-1559 methods.
USE_LEGACY_TX=${USE_LEGACY_TX:-true}
EXTRA_ARGS=""
if [[ "$USE_LEGACY_TX" == "true" || "$USE_LEGACY_TX" == "1" ]]; then
  EXTRA_ARGS+=" --legacy"
fi

# Detect fee history support for info only
if cast rpc --rpc-url "$EFFECTIVE_RPC_URL" eth_feeHistory 1 latest '[0x0]' >/dev/null 2>&1; then
  echo "[deploy_and_bind] RPC supports eth_feeHistory (EIP-1559)."
else
  echo "[deploy_and_bind] RPC lacks eth_feeHistory; using legacy gas mode." 
fi

# Optional static gas price in gwei (e.g., GAS_PRICE_GWEI=2)
GAS_PRICE_GWEI=${GAS_PRICE_GWEI:-}
if [[ -n "$GAS_PRICE_GWEI" ]]; then
  EXTRA_ARGS+=" --gas-price ${GAS_PRICE_GWEI}gwei"
fi

# Some RPCs error on simulation calls; allow skipping simulation.
SKIP_SIMULATION=${SKIP_SIMULATION:-true}
if [[ "$SKIP_SIMULATION" == "true" || "$SKIP_SIMULATION" == "1" ]]; then
  EXTRA_ARGS+=" --skip-simulation"
fi

forge script script/Deploy.s.sol \
  --rpc-url "$EFFECTIVE_RPC_URL" \
  --broadcast \
  --chain-id "$CHAIN_ID" \
  $EXTRA_ARGS

echo "[deploy_and_bind] Binding deployment to frontend..."
node scripts/post_deploy.js

echo "[deploy_and_bind] Done. Frontend env written to frontend/.env.local"
