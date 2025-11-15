#!/usr/bin/env node

/**
 * Wallet Generator for Arkiv Network
 * 
 * This script generates new wallet private keys and addresses
 * and saves them to wallets.json (appending to existing wallets).
 * 
 * Usage:
 *   node scripts/generate-wallets.js [number]
 * 
 * Example:
 *   node scripts/generate-wallets.js 5
 */

import { generatePrivateKey, privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to wallets.json
const walletsPath = join(__dirname, '..', 'wallets.json');

// Get number of wallets from command line or default to 3
const numWallets = parseInt(process.argv[2]) || 3;

console.log('🔑 Generating Arkiv Network Wallets\n');

// Read existing wallets
let existingWallets = [];
try {
  const data = readFileSync(walletsPath, 'utf-8');
  const parsed = JSON.parse(data);
  existingWallets = parsed.wallets || [];
  console.log(`📂 Found ${existingWallets.length} existing wallet(s) in wallets.json\n`);
} catch (error) {
  console.log('📂 No existing wallets found, creating new file\n');
}

console.log(`Generating ${numWallets} new wallet(s)...\n`);
console.log('='.repeat(80));
console.log('');

const newWallets = [];

for (let i = 1; i <= numWallets; i++) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const wallet = {
    privateKey: privateKey.slice(2), // Remove 0x prefix
    address: account.address,
    createdAt: new Date().toISOString(),
  };

  newWallets.push(wallet);

  console.log(`New Wallet ${i}:`);
  console.log(`  Address:     ${account.address}`);
  console.log(`  Private Key: ${privateKey.slice(2)}`);
  console.log('');
}

// Combine existing and new wallets
const allWallets = [...existingWallets, ...newWallets];

// Save to JSON
const walletsData = {
  wallets: allWallets,
  lastUpdated: new Date().toISOString(),
  totalWallets: allWallets.length,
};

writeFileSync(walletsPath, JSON.stringify(walletsData, null, 2), 'utf-8');

console.log('='.repeat(80));
console.log('');
console.log(`✅ Wallets saved to wallets.json`);
console.log(`   Total wallets: ${allWallets.length}`);
console.log(`   New wallets added: ${numWallets}`);
console.log('');
console.log('⚠️  IMPORTANT SECURITY NOTES:');
console.log('  - Keep wallets.json secure and never commit it to git');
console.log('  - Add wallets.json to .gitignore');
console.log('  - Each wallet will need to be funded with ETH for gas fees');
console.log('  - Store backups of wallets.json in a secure location');
console.log('');
console.log('💰 Next steps:');
console.log('  1. Fund each new wallet with ETH for gas fees (suggested: 0.1 ETH per wallet)');
console.log('  2. Restart your application to load the new wallets');
console.log('  3. Verify with: GET /upload/stats/wallet-pool');
console.log('');
