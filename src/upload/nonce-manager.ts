import { Logger } from '@nestjs/common';

/**
 * NonceManager handles nonce sequencing for parallel transaction execution.
 * It ensures that each transaction gets a unique, sequential nonce without conflicts.
 */
export class NonceManager {
  private readonly logger = new Logger(NonceManager.name);
  private wallet: any;
  private nextNonce: number | null = null;
  private pendingTransactions: number = 0;
  private lock: Promise<void> = Promise.resolve();

  constructor(wallet: any) {
    this.wallet = wallet;
  }

  /**
   * Execute a function that sends a transaction with an isolated nonce.
   * This method queues transactions and assigns sequential nonces.
   */
  async executeWithNonce<T>(
    fn: (nonce: number) => Promise<T>,
    description?: string
  ): Promise<T> {
    // Wait for our turn in the queue
    const myTurn = this.lock;
    let release: () => void;

    this.lock = new Promise((resolve) => {
      release = resolve;
    });

    await myTurn;

    try {
      // Get or initialize the nonce
      if (this.nextNonce === null) {
        this.logger.log('Fetching initial nonce from network...');
        const account = this.wallet.account;
        this.nextNonce = await this.wallet.getTransactionCount({
          address: account.address,
          blockTag: 'pending'
        });
        this.logger.log(`Initial nonce: ${this.nextNonce}`);
      }

      const nonceToUse = this.nextNonce;
      this.nextNonce++;
      this.pendingTransactions++;

      if (description) {
        this.logger.debug(`Assigned nonce ${nonceToUse} to: ${description}`);
      }

      // Release the lock so next transaction can get its nonce
      release!();

      // Execute the transaction with the assigned nonce
      try {
        const result = await fn(nonceToUse);
        this.pendingTransactions--;
        return result;
      } catch (error) {
        this.pendingTransactions--;

        // If transaction fails, we might need to reset nonce on next call
        const errorMessage = error.message || String(error);
        if (
          errorMessage.includes('nonce too low') ||
          errorMessage.includes('already known') ||
          errorMessage.includes('replacement transaction underpriced')
        ) {
          this.logger.warn(
            `Nonce error detected (${errorMessage}). Will refresh nonce on next transaction.`
          );
          this.nextNonce = null; // Reset to fetch fresh nonce
        }

        throw error;
      }
    } catch (error) {
      // Release lock in case of error
      release!();
      throw error;
    }
  }

  /**
   * Reset the nonce manager (useful after errors or for testing)
   */
  reset(): void {
    this.nextNonce = null;
    this.pendingTransactions = 0;
    this.logger.log('Nonce manager reset');
  }

  /**
   * Get current state information
   */
  getState(): { nextNonce: number | null; pendingTransactions: number } {
    return {
      nextNonce: this.nextNonce,
      pendingTransactions: this.pendingTransactions,
    };
  }
}
