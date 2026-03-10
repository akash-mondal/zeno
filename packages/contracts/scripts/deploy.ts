/**
 * Deploy ComplianceChecker + PenaltyCalculator to Hedera Testnet
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network hedera_testnet
 *
 * What this script does:
 *   1. Deploy ComplianceChecker contract
 *   2. Deploy PenaltyCalculator contract (linked to ComplianceChecker)
 *   3. Optionally create HTS tokens via precompile (if --create-tokens flag)
 *   4. Print all addresses and HashScan links
 *   5. Save deployment info to deployments/testnet.json
 */

import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log('='.repeat(60));
  console.log('Zeno Smart Contract Deployment — Hedera Testnet');
  console.log('='.repeat(60));
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} HBAR`);
  console.log();

  // ============================================================
  // 1. Deploy ComplianceChecker
  // ============================================================

  console.log('Deploying ComplianceChecker...');
  const ComplianceChecker = await ethers.getContractFactory('ComplianceChecker');
  const checker = await ComplianceChecker.deploy();
  await checker.waitForDeployment();
  const checkerAddress = await checker.getAddress();
  console.log(`  ComplianceChecker deployed at: ${checkerAddress}`);
  console.log(`  HashScan: https://hashscan.io/testnet/contract/${checkerAddress}`);
  console.log();

  // ============================================================
  // 2. Deploy PenaltyCalculator
  // ============================================================

  console.log('Deploying PenaltyCalculator...');
  const PenaltyCalculator = await ethers.getContractFactory('PenaltyCalculator');
  const penalty = await PenaltyCalculator.deploy(checkerAddress);
  await penalty.waitForDeployment();
  const penaltyAddress = await penalty.getAddress();
  console.log(`  PenaltyCalculator deployed at: ${penaltyAddress}`);
  console.log(`  HashScan: https://hashscan.io/testnet/contract/${penaltyAddress}`);
  console.log();

  // ============================================================
  // 3. Create HTS Tokens via Precompile (optional)
  // ============================================================

  let ggccToken = '';
  let violationNFT = '';
  let complianceCertNFT = '';

  const createTokens = process.env.CREATE_TOKENS === 'true';

  if (createTokens) {
    console.log('Creating HTS tokens via precompile...');
    console.log('  Sending 60 HBAR for token creation fees...');

    const tx = await checker.createTokens(
      'Ganga Green Compliance Credit', 'GGCC',
      'Zeno Violation Record', 'ZVIOL',
      'Zeno Compliance Certificate', 'ZCERT',
      { value: ethers.parseEther('60') }
    );

    const receipt = await tx.wait();
    console.log(`  Token creation tx: ${receipt?.hash}`);

    ggccToken = await checker.ggccToken();
    violationNFT = await checker.violationNFT();
    complianceCertNFT = await checker.complianceCertNFT();

    console.log(`  GGCC Token:           ${ggccToken}`);
    console.log(`  Violation NFT:        ${violationNFT}`);
    console.log(`  Compliance Cert NFT:  ${complianceCertNFT}`);
    console.log();
  } else {
    console.log('Skipping HTS token creation (set CREATE_TOKENS=true to enable)');
    console.log('  Token operations will use SDK-based minting (hts.ts)');
    console.log();
  }

  // ============================================================
  // 4. Save Deployment Info
  // ============================================================

  const deploymentInfo = {
    network: 'hedera_testnet',
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      ComplianceChecker: {
        address: checkerAddress,
        hashscan: `https://hashscan.io/testnet/contract/${checkerAddress}`,
      },
      PenaltyCalculator: {
        address: penaltyAddress,
        hashscan: `https://hashscan.io/testnet/contract/${penaltyAddress}`,
      },
    },
    tokens: createTokens ? {
      GGCC: ggccToken,
      ZVIOL: violationNFT,
      ZCERT: complianceCertNFT,
    } : 'Not created (using SDK-based minting)',
  };

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentsDir, 'testnet.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log('='.repeat(60));
  console.log('Deployment Complete!');
  console.log('='.repeat(60));
  console.log(`Saved to: deployments/testnet.json`);
  console.log();
  console.log('Next steps:');
  console.log('  1. Run E2E test:    npx hardhat run scripts/e2e-test.ts --network hedera_testnet');
  console.log('  2. Verify on HashScan: npx hardhat hashscan-verify <address> --network hedera_testnet');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
