import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Chain,
  PublicClient,
  WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const DEFAULT_PASEO_RPC = 'https://testnet-passet-hub-eth-rpc.polkadot.io';
const DEFAULT_PASEO_BLOCK_EXPLORER =
  'https://blockscout-passet-hub.parity-testnet.parity.io';

const storageAbi = [
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'newNumber',
        type: 'uint256',
      },
    ],
    name: 'store',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'retrieve',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newValue',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'updatedBy',
        type: 'address',
      },
    ],
    name: 'NumberUpdated',
    type: 'event',
  },
] as const;

@Injectable()
export class PaseoService {
  private readonly logger = new Logger(PaseoService.name);
  private readonly rpcUrl: string;
  private readonly blockExplorerUrl: string;
  private readonly paseoChain: Chain;
  private readonly publicClient: PublicClient;
  private walletClient?: WalletClient;
  private contractAddress?: `0x${string}`;

  constructor(private readonly configService: ConfigService) {
    this.rpcUrl =
      this.configService.get<string>('PASEO_RPC_URL') || DEFAULT_PASEO_RPC;
    this.blockExplorerUrl =
      this.configService.get<string>('PASEO_BLOCK_EXPLORER') ||
      DEFAULT_PASEO_BLOCK_EXPLORER;

    this.paseoChain = defineChain({
      id: 420420422,
      name: 'Polkadot Hub TestNet',
      network: 'paseo-testnet',
      nativeCurrency: { decimals: 18, name: 'Paseo', symbol: 'PAS' },
      rpcUrls: {
        default: { http: [this.rpcUrl] },
        public: { http: [this.rpcUrl] },
      },
      blockExplorers: {
        default: {
          name: 'Blockscout',
          url: this.blockExplorerUrl,
        },
      },
      testnet: true,
    });

    this.publicClient = createPublicClient({
      chain: this.paseoChain,
      transport: http(this.rpcUrl),
    });

    const primaryKey = this.configService.get<string>('PASEO_PRIVATE_KEY');
    if (primaryKey) {
      const normalizedKey = this.normalizePrivateKey(primaryKey);
      const account = privateKeyToAccount(normalizedKey);
      this.walletClient = createWalletClient({
        account,
        chain: this.paseoChain,
        transport: http(this.rpcUrl),
      });
      this.logger.log(`Wallet ready for Paseo account ${account.address}`);
    } else {
      this.logger.warn(
        'PASEO_PRIVATE_KEY is not configured. Write operations are disabled.',
      );
    }

    const contractEnv =
      this.configService.get<string>('PASEO_STORAGE_CONTRACT');
    if (contractEnv) {
      this.contractAddress = this.normalizeAddress(contractEnv);
      this.logger.log(
        `Storage contract configured at ${this.contractAddress} for Paseo`,
      );
    } else {
      this.logger.warn(
        'PASEO_STORAGE_CONTRACT is not configured. Storage endpoints are disabled until an address is provided.',
      );
    }
  }

  getNetworkMetadata() {
    return {
      chainId: this.paseoChain.id,
      chainName: this.paseoChain.name,
      rpcUrl: this.rpcUrl,
      blockExplorer: this.blockExplorerUrl,
      testnet: this.paseoChain.testnet ?? true,
    };
  }

  async getNetworkStatus() {
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      this.publicClient.getChainId(),
      this.publicClient.getBlockNumber(),
      this.publicClient.getGasPrice().catch(() => null),
    ]);

    return {
      chainId,
      blockNumber: blockNumber.toString(),
      gasPrice: gasPrice ? gasPrice.toString() : null,
      rpcUrl: this.rpcUrl,
      blockExplorer: this.blockExplorerUrl,
    };
  }

  async readStoredNumber() {
    const address = this.ensureContractAddress();
    const number = await this.publicClient.readContract({
      address,
      abi: storageAbi,
      functionName: 'retrieve',
    });
    return number;
  }

  async updateStoredNumber(value: bigint) {
    const walletClient = this.ensureWalletClient();
    const address = this.ensureContractAddress();

    const txHash = await walletClient.writeContract({
      address,
      abi: storageAbi,
      functionName: 'store',
      args: [value],
    });

    return {
      transactionHash: txHash,
      explorerUrl: `${this.blockExplorerUrl}/tx/${txHash}`,
    };
  }

  private ensureContractAddress(): `0x${string}` {
    if (!this.contractAddress) {
      throw new Error(
        'PASEO_STORAGE_CONTRACT is not configured. Please deploy Storage.sol and set the address in the environment.',
      );
    }
    return this.contractAddress;
  }

  private ensureWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new Error(
        'PASEO_PRIVATE_KEY is missing. Set it in the environment to enable write operations.',
      );
    }
    return this.walletClient;
  }

  private normalizePrivateKey(value: string): `0x${string}` {
    const trimmed = value.trim();
    return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  }

  private normalizeAddress(value: string): `0x${string}` {
    const trimmed = value.trim();
    return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  }
}
