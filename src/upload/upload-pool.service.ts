import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createWalletClient, createPublicClient } from '@arkiv-network/sdk';
import { http } from '@arkiv-network/sdk';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { mendoza } from '@arkiv-network/sdk/chains';
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ChunkTask {
  buffer: Buffer;
  metadata: {
    fileName: string;
    mimeType: string;
    size: number;
    chunkIndex: number;
    totalChunks: number;
    userId: string;
    fileId: string;
  };
  retryCount: number;
}

interface WalletQueue {
  walletClient: any;
  walletAddress: string;
  queue: ChunkTask[];
  isProcessing: boolean;
  successCount: number;
  failureCount: number;
}

@Injectable()
export class UploadPoolService implements OnModuleInit {
  private readonly logger = new Logger(UploadPoolService.name);
  private walletQueues: WalletQueue[] = [];
  private publicClient: any;
  private currentDistributionIndex: number = 0;
  private readonly maxRetries = 10;

  constructor(private prisma: PrismaService) { }

  async onModuleInit() {
    try {
      const privateKeys: string[] = [];

      // Try to load wallets from wallets.json first
      try {
        const walletsFile = process.env.ARKIV_WALLETS_FILE || 'wallets.json';
        const walletsPath = join(process.cwd(), walletsFile);
        const walletsData = readFileSync(walletsPath, 'utf-8');
        const parsed = JSON.parse(walletsData);

        if (parsed.wallets && Array.isArray(parsed.wallets) && parsed.wallets.length > 0) {
          parsed.wallets.forEach((wallet: any) => {
            if (wallet.privateKey) {
              privateKeys.push(wallet.privateKey);
            }
          });
          this.logger.log(`Loaded ${privateKeys.length} wallet(s) from ${walletsFile}`);
        } else {
          this.logger.warn(`${walletsFile} exists but has no valid wallets`);
        }
      } catch (error) {
        this.logger.warn('Could not load wallets.json, falling back to environment variables');
      }

      // If no wallets loaded from JSON, fallback to environment variables
      if (privateKeys.length === 0) {
        const primaryKey = process.env.ARKIV_PRIVATE_KEY;
        if (!primaryKey) {
          throw new Error('No wallets found in wallets.json and ARKIV_PRIVATE_KEY is not set in environment variables');
        }
        privateKeys.push(primaryKey);

        // Get additional keys from environment
        let keyIndex = 2;
        while (process.env[`ARKIV_PRIVATE_KEY_${keyIndex}`]) {
          privateKeys.push(process.env[`ARKIV_PRIVATE_KEY_${keyIndex}`]);
          keyIndex++;
        }
        this.logger.log(`Loaded ${privateKeys.length} wallet(s) from environment variables`);
      }

      // Create public client for reading
      this.publicClient = createPublicClient({
        chain: mendoza,
        transport: http(),
      });

      // Initialize wallet queues
      this.walletQueues = privateKeys.map((privateKey) => {
        const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);
        const walletClient = createWalletClient({
          chain: mendoza,
          transport: http(),
          account,
        });

        return {
          walletClient,
          walletAddress: account.address,
          queue: [],
          isProcessing: false,
          successCount: 0,
          failureCount: 0,
        };
      });

      this.logger.log(`Upload Pool initialized with ${this.walletQueues.length} wallet queue(s)`);
      this.walletQueues.forEach((wq, index) => {
        this.logger.log(`  Queue ${index + 1}: ${wq.walletAddress}`);
      });

      // Start processing all queues
      this.walletQueues.forEach((wq, index) => {
        this.processQueue(index);
      });
    } catch (error) {
      this.logger.error('Failed to initialize Upload Pool:', error);
      throw error;
    }
  }

  /**
   * Add chunks to the pool for distributed processing
   */
  async addChunks(
    chunks: Buffer[],
    metadata: {
      fileName: string;
      mimeType: string;
      userId: string;
      fileId: string;
    },
  ): Promise<void> {
    const totalChunks = chunks.length;
    const walletCount = this.walletQueues.length;

    this.logger.log(
      `Adding ${totalChunks} chunks to pool for file ${metadata.fileId} (${walletCount} wallet(s))`,
    );

    // Distribute chunks among wallet queues
    chunks.forEach((chunk, index) => {
      const targetQueueIndex = index % walletCount;
      const task: ChunkTask = {
        buffer: chunk,
        metadata: {
          ...metadata,
          size: chunk.length,
          chunkIndex: index,
          totalChunks,
        },
        retryCount: 0,
      };

      this.walletQueues[targetQueueIndex].queue.push(task);
    });

    // Log distribution
    this.walletQueues.forEach((wq, index) => {
      this.logger.log(
        `  Queue ${index + 1} (${wq.walletAddress}): ${wq.queue.length} chunk(s) pending`,
      );
    });

    // No need to trigger - queues are always running in background
  }

  /**
   * Process queue sequentially (one chunk at a time per wallet)
   * This runs indefinitely in the background, processing chunks as they arrive
   */
  private async processQueue(queueIndex: number): Promise<void> {
    const wq = this.walletQueues[queueIndex];

    if (wq.isProcessing) {
      return; // Already processing
    }

    wq.isProcessing = true;
    this.logger.log(`[Queue ${queueIndex + 1}] Background processor started (wallet: ${wq.walletAddress})`);

    // Infinite loop - keeps running forever
    while (true) {
      // Wait for chunks if queue is empty
      if (wq.queue.length === 0) {
        await this.sleep(500); // Check every 500ms for new chunks
        continue;
      }

      const task = wq.queue.shift();

      try {
        this.logger.log(
          `[Queue ${queueIndex + 1}] Processing chunk ${task.metadata.chunkIndex + 1}/${task.metadata.totalChunks} for file ${task.metadata.fileId}`,
        );

        await this.uploadChunk(task, wq.walletClient, queueIndex);
        wq.successCount++;

        // Update chunk status
        await this.prisma.fileChunk.update({
          where: {
            fileId_chunkIndex: {
              fileId: task.metadata.fileId,
              chunkIndex: task.metadata.chunkIndex,
            },
          },
          data: {
            uploadStatus: 'completed',
          },
        }).catch(() => { });

      } catch (error) {
        wq.failureCount++;
        this.logger.error(
          `[Queue ${queueIndex + 1}] Failed to upload chunk ${task.metadata.chunkIndex + 1}/${task.metadata.totalChunks}:`,
          error.message,
        );

        // Retry logic
        if (task.retryCount < this.maxRetries) {
          task.retryCount++;
          this.logger.warn(
            `[Queue ${queueIndex + 1}] Retry ${task.retryCount}/${this.maxRetries} for chunk ${task.metadata.chunkIndex + 1}`,
          );

          // Update retry count in database
          await this.prisma.fileChunk.update({
            where: {
              fileId_chunkIndex: {
                fileId: task.metadata.fileId,
                chunkIndex: task.metadata.chunkIndex,
              },
            },
            data: {
              uploadStatus: 'retrying',
              retryCount: task.retryCount,
            },
          }).catch(() => { });

          // Re-add to queue for retry
          wq.queue.push(task);
        } else {
          this.logger.error(
            `[Queue ${queueIndex + 1}] Max retries reached for chunk ${task.metadata.chunkIndex + 1}. Marking as failed.`,
          );

          // Mark as failed in database
          await this.prisma.fileChunk.update({
            where: {
              fileId_chunkIndex: {
                fileId: task.metadata.fileId,
                chunkIndex: task.metadata.chunkIndex,
              },
            },
            data: {
              uploadStatus: 'failed',
              retryCount: this.maxRetries,
            },
          }).catch(() => { });
        }
      }

      // Small delay between uploads to avoid rate limits
      await this.sleep(100);
    }

    // This code is never reached since the loop runs forever
    // But kept for safety in case of unexpected break
    wq.isProcessing = false;
    this.logger.error(
      `[Queue ${queueIndex + 1}] Background processor stopped unexpectedly! Success: ${wq.successCount}, Failures: ${wq.failureCount}`,
    );
  }

  /**
   * Upload a single chunk with the assigned wallet
   */
  private async uploadChunk(
    task: ChunkTask,
    walletClient: any,
    queueIndex: number,
  ): Promise<void> {
    const entityId = randomUUID();
    const { buffer, metadata } = task;

    const result = await walletClient.createEntity({
      payload: jsonToPayload({
        entity: {
          entityType: 'file-chunk',
          entityId,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          userId: metadata.userId,
          size: metadata.size,
          uploadedAt: Date.now(),
          chunkIndex: metadata.chunkIndex,
          totalChunks: metadata.totalChunks,
        },
        data: buffer.toString('base64'),
      }),
      contentType: 'application/json',
      attributes: [
        { key: 'type', value: 'file-chunk' },
        { key: 'fileName', value: metadata.fileName },
        { key: 'mimeType', value: metadata.mimeType },
        { key: 'userId', value: metadata.userId },
        { key: 'chunkIndex', value: metadata.chunkIndex.toString() },
        { key: 'totalChunks', value: metadata.totalChunks.toString() },
      ],
      expiresIn: ExpirationTime.fromDays(30),
    });

    this.logger.log(
      `[Queue ${queueIndex + 1}] Chunk ${metadata.chunkIndex + 1}/${metadata.totalChunks} uploaded - Key: ${result.entityKey}`,
    );

    // Update chunk in database with entity key
    await this.prisma.fileChunk.update({
      where: {
        fileId_chunkIndex: {
          fileId: metadata.fileId,
          chunkIndex: metadata.chunkIndex,
        },
      },
      data: {
        arkivAddress: result.entityKey,
        txHash: result.txHash,
      },
    }).catch(() => { });
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalWallets: this.walletQueues.length,
      queues: this.walletQueues.map((wq, index) => ({
        queueIndex: index + 1,
        walletAddress: wq.walletAddress,
        pendingChunks: wq.queue.length,
        isProcessing: wq.isProcessing,
        successCount: wq.successCount,
        failureCount: wq.failureCount,
      })),
    };
  }

  /**
   * Helper: sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
