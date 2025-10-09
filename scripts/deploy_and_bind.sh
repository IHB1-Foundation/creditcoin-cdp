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

echo "[deploy_and_bind] Building contracts..."
forge build > /dev/null

echo "[deploy_and_bind] Deploying via forge script to chain ${CHAIN_ID}..."

# Some RPC providers (or non-EIP1559 chains) don't support fee history or EIP-1559 methods.
# Default to legacy tx unless explicitly disabled.
USE_LEGACY_TX=${USE_LEGACY_TX:-true}
LEGACY_FLAG=()
if [[ "$USE_LEGACY_TX" == "true" || "$USE_LEGACY_TX" == "1" ]]; then
  LEGACY_FLAG=(--legacy)
fi

# Optional static gas price in gwei (e.g., GAS_PRICE_GWEI=2)
GAS_PRICE_GWEI=${GAS_PRICE_GWEI:-}
GAS_PRICE_FLAG=()
if [[ -n "$GAS_PRICE_GWEI" ]]; then
  GAS_PRICE_FLAG=(--gas-price "${GAS_PRICE_GWEI}gwei")
fi

# Some RPCs error on simulation calls; allow skipping simulation.
SKIP_SIMULATION=${SKIP_SIMULATION:-true}
SIM_FLAG=()
if [[ "$SKIP_SIMULATION" == "true" || "$SKIP_SIMULATION" == "1" ]]; then
  SIM_FLAG=(--skip-simulation)
fi

forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --chain-id "$CHAIN_ID" \
  "${LEGACY_FLAG[@]}" \
  "${GAS_PRICE_FLAG[@]}" \
  "${SIM_FLAG[@]}"

echo "[deploy_and_bind] Binding deployment to frontend..."
node scripts/post_deploy.js

echo "[deploy_and_bind] Done. Frontend env written to frontend/.env.local"
