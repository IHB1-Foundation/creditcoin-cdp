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

# Inline post-deploy binding logic (no external file dependency)
node <<'NODE'
const fs = require('fs');
const path = require('path');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeFile(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }

function findBroadcastFile(root, chainId) {
  const p = path.join(root, 'broadcast', 'Deploy.s.sol', String(chainId), 'run-latest.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Broadcast file not found: ${p}. Did forge script run with --broadcast?`);
  }
  return p;
}

function extractAddresses(broadcast) {
  const out = {};
  const want = new Set([
    'WCTC',
    'CreditCoinUSD',
    'PushOracle',
    'MockOracle',
    'Treasury',
    'VaultManager',
    'StabilityPool',
    'LiquidationEngine',
  ]);
  const txs = Array.isArray(broadcast.transactions) ? broadcast.transactions : [];
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    const name = t.contractName || t.contract || t.name;
    if (!name || !want.has(name)) continue;
    let addr = t.contractAddress || t.address;
    if (!addr && Array.isArray(broadcast.receipts) && broadcast.receipts[i]) {
      addr = broadcast.receipts[i].contractAddress;
    }
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) out[name] = addr;
  }
  const missing = [...want].filter((k) => !out[k]);
  if (missing.length) throw new Error(`Could not find deployed addresses for: ${missing.join(', ')}`);
  return out;
}

function loadEnv(filepath) {
  return fs.readFileSync(filepath, 'utf8').split(/\r?\n/);
}
function updateEnvLines(lines, updates) {
  const keys = Object.keys(updates); const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) return line;
    const key = m[1]; if (updates.hasOwnProperty(key)) { seen.add(key); return `${key}=${updates[key]}`; }
    return line;
  });
  for (const k of keys) if (!seen.has(k)) out.push(`${k}=${updates[k]}`);
  return out.join('\n') + '\n';
}

function main() {
  const root = process.cwd();
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env at repo root');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envMap = Object.fromEntries(
    envContent.split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]])
  );
  const chainId = envMap.CHAIN_ID || process.env.CHAIN_ID;
  const rpcUrl = envMap.RPC_URL || process.env.RPC_URL || '';
  const chainName = process.env.NEXT_PUBLIC_CHAIN_NAME || 'CreditCoin Testnet';
  const explorer = process.env.NEXT_PUBLIC_BLOCK_EXPLORER || 'https://explorer.creditcoin.org';
  if (!chainId) throw new Error('CHAIN_ID not set in .env');

  const broadcastPath = findBroadcastFile(root, chainId);
  const broadcast = readJSON(broadcastPath);
  const addrs = extractAddresses(broadcast);

  // Update root .env with deployed addresses
  const updatedEnv = updateEnvLines(loadEnv(envPath), {
    WCTC_ADDRESS: addrs.WCTC,
    STABLECOIN_ADDRESS: addrs.CreditCoinUSD,
    ORACLE_ADDRESS: addrs.PushOracle || addrs.MockOracle,
    TREASURY_ADDRESS: addrs.Treasury,
    VAULT_MANAGER_ADDRESS: addrs.VaultManager,
    STABILITY_POOL_ADDRESS: addrs.StabilityPool,
    LIQUIDATION_ENGINE_ADDRESS: addrs.LiquidationEngine,
  });
  writeFile(envPath, updatedEnv);

  // Write frontend/.env.local
  const frontendEnv = [
    `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
    `NEXT_PUBLIC_CHAIN_NAME=${JSON.stringify(chainName)}`,
    `NEXT_PUBLIC_RPC_URL=${rpcUrl}`,
    `NEXT_PUBLIC_BLOCK_EXPLORER=${explorer}`,
    '',
    `NEXT_PUBLIC_WCTC_ADDRESS=${addrs.WCTC}`,
    `NEXT_PUBLIC_RUSD_ADDRESS=${addrs.CreditCoinUSD}`,
    `NEXT_PUBLIC_VAULT_MANAGER_ADDRESS=${addrs.VaultManager}`,
    `NEXT_PUBLIC_STABILITY_POOL_ADDRESS=${addrs.StabilityPool}`,
    `NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS=${addrs.LiquidationEngine}`,
    `NEXT_PUBLIC_ORACLE_ADDRESS=${addrs.PushOracle || addrs.MockOracle}`,
    `NEXT_PUBLIC_TREASURY_ADDRESS=${addrs.Treasury}`,
    '',
  ].join('\n');
  writeFile(path.join(root, 'frontend', '.env.local'), frontendEnv);

  console.log('[deploy_and_bind] Updated .env and wrote frontend/.env.local');
}

try { main(); } catch (e) { console.error('[deploy_and_bind] Error:', e.message || e); process.exit(1); }
NODE

echo "[deploy_and_bind] Done. Frontend env written to frontend/.env.local"
