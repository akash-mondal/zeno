/**
 * Verify contracts on HashScan via Sourcify API
 *
 * Usage: npx tsx scripts/verify.ts
 *
 * This bypasses the hashscan-verify Hardhat plugin which has
 * monorepo module resolution issues. Uses Sourcify REST API directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SOURCIFY_API = 'https://server-verify.hashscan.io';
const CHAIN_ID = '296'; // Hedera testnet

interface ContractVerification {
  name: string;
  address: string;
  sourcePath: string;
}

async function verifyContract(contract: ContractVerification): Promise<boolean> {
  console.log(`\nVerifying ${contract.name} at ${contract.address}...`);

  // Read the Solidity source
  const contractsDir = path.resolve(__dirname, '../contracts');

  // Collect all Solidity files needed
  const solFiles: Record<string, string> = {};

  // Main contract
  const mainSource = fs.readFileSync(path.resolve(contractsDir, contract.sourcePath), 'utf-8');
  solFiles[`contracts/${contract.sourcePath}`] = mainSource;

  // HTS precompile files
  const hederaDir = path.resolve(contractsDir, 'hedera');
  if (fs.existsSync(hederaDir)) {
    for (const file of fs.readdirSync(hederaDir)) {
      if (file.endsWith('.sol')) {
        solFiles[`contracts/hedera/${file}`] = fs.readFileSync(path.resolve(hederaDir, file), 'utf-8');
      }
    }
  }

  // Read compiler metadata from artifacts
  const artifactPath = path.resolve(
    __dirname, '..', 'artifacts', 'contracts',
    contract.sourcePath, `${contract.name}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    console.log(`  Artifact not found: ${artifactPath}`);
    console.log('  Run "npx hardhat compile" first');
    return false;
  }

  // Read the build-info for metadata
  const buildInfoDir = path.resolve(__dirname, '..', 'artifacts', 'build-info');
  const buildInfoFiles = fs.readdirSync(buildInfoDir).filter(f => f.endsWith('.json'));

  if (buildInfoFiles.length === 0) {
    console.log('  No build-info files found');
    return false;
  }

  // Use the latest build-info
  const buildInfo = JSON.parse(
    fs.readFileSync(path.resolve(buildInfoDir, buildInfoFiles[buildInfoFiles.length - 1]), 'utf-8')
  );

  // Extract metadata JSON for this contract
  const contractKey = `contracts/${contract.sourcePath}`;
  const outputContract = buildInfo.output?.contracts?.[contractKey]?.[contract.name];
  if (!outputContract?.metadata) {
    console.log(`  Metadata not found for ${contract.name}`);
    return false;
  }

  const metadataStr = outputContract.metadata;

  // Prepare multipart form data
  const formData = new FormData();
  formData.append('address', contract.address);
  formData.append('chain', CHAIN_ID);

  // Add metadata.json
  formData.append('files', new Blob([metadataStr], { type: 'application/json' }), 'metadata.json');

  // Add source files
  for (const [filePath, content] of Object.entries(solFiles)) {
    formData.append('files', new Blob([content], { type: 'text/plain' }), filePath);
  }

  try {
    const response = await fetch(`${SOURCIFY_API}/verify`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (response.ok && result.result?.[0]?.status === 'perfect') {
      console.log(`  ✓ ${contract.name} verified (perfect match)`);
      console.log(`  HashScan: https://hashscan.io/testnet/contract/${contract.address}`);
      return true;
    } else if (response.ok && result.result?.[0]?.status === 'partial') {
      console.log(`  ✓ ${contract.name} verified (partial match)`);
      console.log(`  HashScan: https://hashscan.io/testnet/contract/${contract.address}`);
      return true;
    } else {
      console.log(`  ✗ Verification failed:`, JSON.stringify(result, null, 2).substring(0, 500));
      return false;
    }
  } catch (error) {
    console.log(`  ✗ Error: ${(error as Error).message}`);
    return false;
  }
}

async function main() {
  // Load deployment info
  const deploymentPath = path.resolve(__dirname, '..', 'deployments', 'testnet.json');
  if (!fs.existsSync(deploymentPath)) {
    console.log('No deployment found. Run deploy.ts first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));

  console.log('='.repeat(60));
  console.log('Zeno Contract Verification — HashScan / Sourcify');
  console.log('='.repeat(60));

  const contracts: ContractVerification[] = [
    {
      name: 'ComplianceChecker',
      address: deployment.contracts.ComplianceChecker.address,
      sourcePath: 'ComplianceChecker.sol',
    },
    {
      name: 'PenaltyCalculator',
      address: deployment.contracts.PenaltyCalculator.address,
      sourcePath: 'PenaltyCalculator.sol',
    },
  ];

  let allVerified = true;
  for (const contract of contracts) {
    const success = await verifyContract(contract);
    if (!success) allVerified = false;
  }

  console.log('\n' + '='.repeat(60));
  if (allVerified) {
    console.log('All contracts verified on HashScan!');
  } else {
    console.log('Some contracts failed verification.');
  }
}

main().catch(console.error);
