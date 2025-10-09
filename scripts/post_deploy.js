#!/usr/bin/env node
/*
  Post-deploy binder
  - Reads Foundry broadcast file for Deploy.s.sol
  - Extracts deployed addresses by contractName
  - Updates root .env address entries
  - Writes frontend/.env.local with NEXT_PUBLIC_* values
*/

const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeFile(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

function findBroadcastFile(chainId) {
  const p = path.join(
    process.cwd(),
    'broadcast',
    'Deploy.s.sol',
    String(chainId),
    'run-latest.json'
  );
  if (!fs.existsSync(p)) {
    throw new Error(`Broadcast file not found: ${p}`);
  }
  return p;
}

function extractAddresses(broadcast) {
  const out = {};
  const want = new Set([
    'WCTC',
    'Stablecoin',
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
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
      out[name] = addr;
    }
  }

  // Basic validation
  const missing = [...want].filter((k) => !out[k]);
  if (missing.length) {
    throw new Error(
      `Could not find deployed addresses for: ${missing.join(', ')}. ` +
        'Ensure the deploy script ran with --broadcast.'
    );
  }
  return out;
}

function loadEnv(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  return raw.split(/\r?\n/);
}

function updateEnvLines(lines, updates) {
  const keys = Object.keys(updates);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (updates.hasOwnProperty(key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  // Append any missing keys at end
  for (const k of keys) {
    if (!seen.has(k)) out.push(`${k}=${updates[k]}`);
  }
  return out.join('\n') + '\n';
}

function main() {
  const root = process.cwd();
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env at repo root');
  }

  // Load .env to get CHAIN_ID, RPC_URL, optional extras
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envMap = Object.fromEntries(
    envContent
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]])
  );

  const chainId = envMap.CHAIN_ID || process.env.CHAIN_ID;
  const rpcUrl = envMap.RPC_URL || process.env.RPC_URL || '';
  if (!chainId) throw new Error('CHAIN_ID not set in .env');

  const broadcastPath = findBroadcastFile(chainId);
  const broadcast = readJSON(broadcastPath);
  const addrs = extractAddresses(broadcast);

  // Update root .env with deployed addresses
  const updatedEnv = updateEnvLines(loadEnv(envPath), {
    WCTC_ADDRESS: addrs.WCTC,
    STABLECOIN_ADDRESS: addrs.Stablecoin,
    ORACLE_ADDRESS: addrs.PushOracle || addrs.MockOracle,
    TREASURY_ADDRESS: addrs.Treasury,
    VAULT_MANAGER_ADDRESS: addrs.VaultManager,
    STABILITY_POOL_ADDRESS: addrs.StabilityPool,
    LIQUIDATION_ENGINE_ADDRESS: addrs.LiquidationEngine,
  });
  writeFile(envPath, updatedEnv);

  // Prepare frontend env
  const chainName = process.env.NEXT_PUBLIC_CHAIN_NAME || 'CreditCoin Testnet';
  const explorer = process.env.NEXT_PUBLIC_BLOCK_EXPLORER || 'https://explorer.creditcoin.org';

  const frontendEnv = [
    `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
    `NEXT_PUBLIC_CHAIN_NAME=${JSON.stringify(chainName)}`,
    `NEXT_PUBLIC_RPC_URL=${rpcUrl}`,
    `NEXT_PUBLIC_BLOCK_EXPLORER=${explorer}`,
    '',
    `NEXT_PUBLIC_WCTC_ADDRESS=${addrs.WCTC}`,
    `NEXT_PUBLIC_RUSD_ADDRESS=${addrs.Stablecoin}`,
    `NEXT_PUBLIC_VAULT_MANAGER_ADDRESS=${addrs.VaultManager}`,
    `NEXT_PUBLIC_STABILITY_POOL_ADDRESS=${addrs.StabilityPool}`,
    `NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS=${addrs.LiquidationEngine}`,
    `NEXT_PUBLIC_ORACLE_ADDRESS=${addrs.PushOracle || addrs.MockOracle}`,
    `NEXT_PUBLIC_TREASURY_ADDRESS=${addrs.Treasury}`,
    '',
  ].join('\n');

  const frontendEnvPath = path.join(root, 'frontend', '.env.local');
  writeFile(frontendEnvPath, frontendEnv);

  console.log('[post_deploy] Updated .env and wrote frontend/.env.local');
}

try {
  main();
} catch (err) {
  console.error('[post_deploy] Error:', err.message || err);
  process.exit(1);
}
