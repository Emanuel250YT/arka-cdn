import { Logger } from '@nestjs/common';
import { NonceManager } from './nonce-manager';

/**
 * WalletPool manages multiple wallets and distributes transactions across them.
 * This allows for true parallel transaction execution at scale.
 */
export class WalletPool {
  private readonly logger = new Logger(WalletPool.name);
  private wallets: Array<{
    client: any;
    nonceManager: NonceManager;
    address: string;
    activeTransactions: number;
  }> = [];
  private currentIndex: number = 0;

  constructor(walletClients: any[]) {
    if (walletClients.length === 0) {
      throw new Error('WalletPool requires at least one wallet');
    }

    this.wallets = walletClients.map((client) => ({
      client,
      nonceManager: new NonceManager(client),
      address: client.account.address,
      activeTransactions: 0,
    }));

    this.logger.log(`Initialized WalletPool with ${this.wallets.length} wallet(s)`);
    this.wallets.forEach((wallet, i) => {
      this.logger.log(`  Wallet ${i + 1}: ${wallet.address}`);
    });
  }

  /**
   * Get the least busy wallet (round-robin with load balancing)
   */
  private getNextWallet() {
    // Find wallet with least active transactions
    let leastBusyIndex = 0;
    let minTransactions = this.wallets[0].activeTransactions;

    for (let i = 1; i < this.wallets.length; i++) {
      if (this.wallets[i].activeTransactions < minTransactions) {
        minTransactions = this.wallets[i].activeTransactions;
        leastBusyIndex = i;
      }
    }

    // If all wallets have same load, use round-robin
    if (minTransactions === this.wallets[0].activeTransactions) {
      const wallet = this.wallets[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.wallets.length;
      return wallet;
    }

    return this.wallets[leastBusyIndex];
  }

  /**
   * Execute a transaction using the least busy wallet
   */
  async executeTransaction<T>(
    fn: (client: any, nonce: number) => Promise<T>,
    description?: string
  ): Promise<{ result: T; walletAddress: string }> {
    const wallet = this.getNextWallet();
    wallet.activeTransactions++;

    try {
      const result = await wallet.nonceManager.executeWithNonce(
        async (nonce) => {
          const desc = description
            ? `${description} [Wallet: ${wallet.address.slice(0, 8)}...]`
            : `Transaction [Wallet: ${wallet.address.slice(0, 8)}...]`;

          this.logger.debug(`Executing: ${desc}`);
          return await fn(wallet.client, nonce);
        },
        description
      );

      wallet.activeTransactions--;
      return {
        result,
        walletAddress: wallet.address,
      };
    } catch (error) {
      wallet.activeTransactions--;
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalWallets: this.wallets.length,
      wallets: this.wallets.map((wallet, index) => ({
        index: index + 1,
        address: wallet.address,
        activeTransactions: wallet.activeTransactions,
        state: wallet.nonceManager.getState(),
      })),
    };
  }

  /**
   * Reset all nonce managers
   */
  resetAll(): void {
    this.logger.log('Resetting all wallet nonce managers');
    this.wallets.forEach((wallet) => {
      wallet.nonceManager.reset();
      wallet.activeTransactions = 0;
    });
  }

  /**
   * Get total active transactions across all wallets
   */
  getTotalActiveTransactions(): number {
    return this.wallets.reduce((sum, wallet) => sum + wallet.activeTransactions, 0);
  }
}
