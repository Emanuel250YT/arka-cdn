import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log('🚀 Deploying Storage contract with:', deployerAddress);

  const storage = await ethers.deployContract('Storage');
  await storage.waitForDeployment();

  const contractAddress = await storage.getAddress();

  console.log('✅ Storage deployed to:', contractAddress);
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exitCode = 1;
});
