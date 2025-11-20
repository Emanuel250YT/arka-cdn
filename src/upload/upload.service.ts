/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadPoolService } from './upload-pool.service';
import { createWalletClient, createPublicClient } from '@arkiv-network/sdk';
import { http } from '@arkiv-network/sdk';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { mendoza } from '@arkiv-network/sdk/chains';
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils';
import sharp from 'sharp';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { checkFFmpegInstalled } from './ffmpeg-check';
import { TempDirManager } from './temp-dir-manager';

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private arkivClient: any;
  private publicClient: any;
  private walletClients: any[] = [];
  private currentWalletIndex: number = 0;
  private readonly CHUNK_SIZE = 64 * 1024; // 16KB chunks
  private readonly MAX_IMAGE_WIDTH = 1920; // 1080p width
  private readonly MAX_IMAGE_HEIGHT = 1080; // 1080p height
  private readonly IMAGE_QUALITY = 80; // Calidad de compresión
  private readonly VIDEO_RESOLUTION = '1920x1080'; // Máximo 1080p

  constructor(
    private prisma: PrismaService,
    private uploadPool: UploadPoolService,
  ) { }

  async onModuleInit() {
    try {
      const privateKeys: string[] = [];

      // Try to load wallets from wallets.json first
      try {
        // Allow overriding the wallets.json path via environment variable
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
          this.logger.log(`Loaded ${privateKeys.length} wallet(s) from wallets.json`);
        } else {
          this.logger.warn('wallets.json exists but has no valid wallets');
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

      // Create wallet clients
      this.walletClients = privateKeys.map((privateKey) => {
        const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);
        return createWalletClient({
          chain: mendoza,
          transport: http(),
          account,
        });
      });

      // Set primary client
      this.arkivClient = this.walletClients[0];

      this.logger.log(`Arkiv clients initialized successfully with ${this.walletClients.length} wallet(s)`);
      this.walletClients.forEach((client, index) => {
        this.logger.log(`  Wallet ${index + 1}: ${client.account.address}`);
      });

      // Check FFmpeg installation (non-blocking warning)
      this.checkFFmpegAvailability();

      // Initialize temporary directories
      await TempDirManager.initialize();

      // Cleanup old temp directories (fire and forget)
      TempDirManager.cleanupOldTempDirs().catch((error) => {
        this.logger.warn('Failed to cleanup old temp directories:', error.message);
      });
    } catch (error) {
      this.logger.error('Failed to initialize Arkiv client:', error);
      throw error;
    }
  }

  /**
   * Check if FFmpeg is available (non-blocking)
   */
  private async checkFFmpegAvailability() {
    try {
      const ffmpegCheck = await checkFFmpegInstalled();
      if (ffmpegCheck.installed) {
        this.logger.log(`FFmpeg detected: version ${ffmpegCheck.version}`);
      } else {
        this.logger.warn(
          'FFmpeg is not installed or not accessible. ' +
          'Video compression and DASH conversion will fail. ' +
          'Install FFmpeg from: https://ffmpeg.org/download.html'
        );
      }
    } catch (error) {
      this.logger.warn('Could not verify FFmpeg installation:', error.message);
    }
  }

  /**
   * Check if file has expired based on expiresAt field
   */
  private checkFileExpiration(file: any): void {
    if (file.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(file.expiresAt);

      if (now > expiresAt) {
        this.logger.warn(`File ${file.id} has expired (expiresAt: ${expiresAt.toISOString()})`);
        throw new Error('File has expired and is no longer available');
      }
    }
  }

  /**
   * Compress and resize image
   */
  private async compressImage(buffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      this.logger.log(
        `Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`,
      );

      // Resize if larger than 1080p
      let processedImage = image;

      if (
        metadata.width > this.MAX_IMAGE_WIDTH ||
        metadata.height > this.MAX_IMAGE_HEIGHT
      ) {
        processedImage = image.resize(this.MAX_IMAGE_WIDTH, this.MAX_IMAGE_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        this.logger.log('Image resized to fit 1080p');
      }

      // Convert to JPEG with compression
      const compressed = await processedImage
        .jpeg({ quality: this.IMAGE_QUALITY, mozjpeg: true })
        .toBuffer();

      this.logger.log(
        `Image compressed: ${buffer.length} bytes -> ${compressed.length} bytes (${Math.round((1 - compressed.length / buffer.length) * 100)}% reduction)`,
      );

      return compressed;
    } catch (error) {
      this.logger.error('Error compressing image:', error);
      throw new Error('Failed to compress image');
    }
  }

  /**
   * Get optimized encoder configurations based on speed priority and hardware detection
   */
  private async getOptimizedEncoderConfigs(): Promise<Array<{name: string, options: string[]}>> {
    return [
      {
        name: 'Hardware H.264 NVIDIA (h264_nvenc)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'h264_nvenc',
          '-preset', 'fast',
          '-cq', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'Hardware H.264 AMD (h264_amf)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'h264_amf',
          '-quality', 'speed',
          '-rc', 'cqp',
          '-qp_i', '23',
          '-qp_p', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'Hardware H.265 NVIDIA (hevc_nvenc)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'hevc_nvenc',
          '-preset', 'fast',
          '-cq', '25',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'Hardware H.265 AMD (hevc_amf)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'hevc_amf',
          '-quality', 'speed',
          '-rc', 'cqp',
          '-qp_i', '25',
          '-qp_p', '25',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'libx264 ultrafast preset (H.264)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'libx264 fast preset (H.264)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'libx264 medium preset (H.264)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      },
      {
        name: 'Software fallback (basic)',
        options: [
          '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
          '-b:v', '1M',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ]
      }
    ];
  }

  /**
   * Compress video with fallback encoders
   */
  private async compressVideo(buffer: Buffer, originalName: string): Promise<Buffer> {
    let tempDir: string;
    let tempInputPath: string;
    let tempOutputPath: string;

    try {
      // Create temporary directory for this operation
      tempDir = await TempDirManager.createTempDir('video-compression');
      tempInputPath = TempDirManager.getTempFilePath(tempDir, `input-${originalName}`);
      tempOutputPath = TempDirManager.getTempFilePath(tempDir, 'output.mp4');

      // Write buffer to temp file
      await writeFile(tempInputPath, buffer);

      this.logger.log(`Compressing video: ${originalName} (${buffer.length} bytes) in ${tempDir}`);
      this.logger.debug(`Input path: ${tempInputPath}`);
      this.logger.debug(`Output path: ${tempOutputPath}`);

      // Get optimized encoder configs based on available hardware
      const encoderConfigs = await this.getOptimizedEncoderConfigs();

      // Try each encoder configuration
      for (let i = 0; i < encoderConfigs.length; i++) {
        const config = encoderConfigs[i];
        try {
          this.logger.log(`[${i+1}/${encoderConfigs.length}] Attempting compression with ${config.name}...`);
          
          // Set different timeouts based on encoder type
          const isHardware = config.name.includes('Hardware') || config.name.includes('nvenc') || config.name.includes('amf');
          const timeoutMinutes = isHardware ? 3 : 8; // Hardware: 3 min, Software: 8 min
          
          const startTime = Date.now();
          const result = await this.tryCompressionWithConfig(
            tempInputPath, 
            tempOutputPath, 
            config.options, 
            buffer.length,
            timeoutMinutes
          );
          const compressionTime = ((Date.now() - startTime) / 1000).toFixed(1);
          
          // Clean up temp directory on success
          await TempDirManager.cleanupTempDir(tempDir);
          
          this.logger.log(`✅ Successfully compressed video using ${config.name} in ${compressionTime}s`);
          return result;
        } catch (error) {
          this.logger.warn(`❌ Compression failed with ${config.name}: ${error.message}`);
          
          // If this is the last config, clean up and return original
          if (i === encoderConfigs.length - 1) {
            await TempDirManager.cleanupTempDir(tempDir);
            this.logger.warn('All compression methods failed, returning original video');
            return buffer;
          }
          
          // Otherwise, continue to next configuration
          continue;
        }
      }

      // This shouldn't be reached, but just in case
      return buffer;

    } catch (error) {
      // Ensure cleanup on any error
      if (tempDir) {
        await TempDirManager.cleanupTempDir(tempDir);
      }
      
      this.logger.error('Video compression setup failed:', error);
      
      // Return original buffer if setup fails
      this.logger.warn('Returning original video due to setup failure');
      return buffer;
    }
  }

  /**
   * Try compression with specific configuration
   */
  private async tryCompressionWithConfig(
    inputPath: string, 
    outputPath: string, 
    options: string[], 
    originalSize: number,
    timeoutMinutes: number = 10
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpegCommand = Ffmpeg(inputPath)
        .outputOptions(options)
        .output(outputPath)
        .on('start', (commandLine) => {
          this.logger.debug(`FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            this.logger.debug(`Compression progress: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', async () => {
          try {
            const compressed = await readFile(outputPath);

            this.logger.log(
              `Video compressed: ${originalSize} bytes -> ${compressed.length} bytes (${Math.round((1 - compressed.length / originalSize) * 100)}% reduction)`,
            );

            resolve(compressed);
          } catch (error) {
            this.logger.error('Error reading compressed video:', error);
            reject(error);
          }
        })
        .on('error', (error, stdout, stderr) => {
          this.logger.debug('FFmpeg error details:', {
            error: error.message,
            code: error['code'],
            stdout: stdout || 'none',
            stderr: (stderr || '').substring(0, 200) + '...',
          });

          reject(new Error(
            `FFmpeg failed: ${error.message}`
          ));
        });

      // Set timeout for compression based on encoder type
      const timeout = setTimeout(() => {
        ffmpegCommand.kill('SIGKILL');
        reject(new Error(`Video compression timeout (${timeoutMinutes} minutes)`));
      }, timeoutMinutes * 60 * 1000);

      ffmpegCommand.on('end', () => clearTimeout(timeout));
      ffmpegCommand.on('error', () => clearTimeout(timeout));

      ffmpegCommand.run();
    });
  }

  /**
   * Split buffer into chunks
   */
  private chunkBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      const end = Math.min(offset + chunkSize, buffer.length);
      chunks.push(buffer.slice(offset, end));
      offset = end;
    }

    return chunks;
  }

  /**
   * Get next wallet in round-robin fashion
   */
  private getNextWallet(): any {
    const wallet = this.walletClients[this.currentWalletIndex];
    this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletClients.length;
    return wallet;
  }

  /**
   * Upload a single chunk to Arkiv with retry logic (up to 10 retries)
   */
  private async uploadChunkToArkiv(
    buffer: Buffer,
    metadata: {
      fileName: string;
      mimeType: string;
      size: number;
      chunkIndex: number;
      totalChunks: number;
      userId: string;
      fileId: string;
    },
    walletClient: any,
  ): Promise<{ entityKey: string; txHash: string }> {
    const maxRetries = 10;
    let retryCount = 0;
    let lastError: Error;

    while (retryCount < maxRetries) {
      try {
        const entityId = randomUUID();

        if (retryCount > 0) {
          this.logger.warn(
            `Retry ${retryCount}/${maxRetries} for chunk ${metadata.chunkIndex + 1}/${metadata.totalChunks} of ${metadata.fileName}`
          );
        }

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
          `Chunk ${metadata.chunkIndex + 1}/${metadata.totalChunks} uploaded - Key: ${result.entityKey}`
        );

        // Update chunk in database
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
            uploadStatus: 'completed',
          },
        });

        return {
          entityKey: result.entityKey,
          txHash: result.txHash,
        };
      } catch (error) {
        lastError = error;
        const errorMessage = error.message || String(error);

        if (retryCount < maxRetries - 1) {
          // Exponential backoff
          const delayMs = Math.min(Math.pow(2, retryCount) * 1000, 30000); // Max 30s
          this.logger.warn(
            `Error uploading chunk ${metadata.chunkIndex + 1}: ${errorMessage}. Retrying in ${delayMs}ms...`
          );

          // Update chunk status to retrying
          await this.prisma.fileChunk.update({
            where: {
              fileId_chunkIndex: {
                fileId: metadata.fileId,
                chunkIndex: metadata.chunkIndex,
              },
            },
            data: {
              uploadStatus: 'retrying',
              retryCount: retryCount + 1,
            },
          }).catch(() => { }); // Ignore errors updating status

          await new Promise(resolve => setTimeout(resolve, delayMs));
          retryCount++;
          continue;
        }

        // Max retries reached - mark as failed
        this.logger.error(
          `Failed to upload chunk ${metadata.chunkIndex + 1} after ${maxRetries} attempts: ${errorMessage}`
        );

        await this.prisma.fileChunk.update({
          where: {
            fileId_chunkIndex: {
              fileId: metadata.fileId,
              chunkIndex: metadata.chunkIndex,
            },
          },
          data: {
            uploadStatus: 'failed',
            retryCount: maxRetries,
          },
        }).catch(() => { });

        throw new Error(
          `Failed to upload chunk after ${maxRetries} attempts: ${errorMessage}`
        );
      }
    }

    throw lastError;
  }

  /**
   * Upload chunks in background using Upload Pool
   */
  private async uploadInBackground(
    chunks: Buffer[],
    metadata: {
      fileName: string;
      mimeType: string;
      userId: string;
      fileId: string;
    },
  ): Promise<void> {
    // Delegate to UploadPoolService for sequential processing per wallet
    await this.uploadPool.addChunks(chunks, metadata);

    // Monitor upload status asynchronously
    this.monitorUploadStatus(metadata.fileId, chunks.length).catch((error) => {
      this.logger.error(`Failed to monitor upload status for file ${metadata.fileId}:`, error);
    });
  }

  /**
   * Monitor upload status and update file status when complete
   */
  private async monitorUploadStatus(fileId: string, totalChunks: number): Promise<void> {
    const checkInterval = 5000; // Check every 5 seconds
    const maxChecks = 720; // Max 1 hour (720 * 5s)
    let checks = 0;

    this.logger.log(`[Monitor] Starting upload monitoring for file ${fileId} (${totalChunks} chunks)`);

    while (checks < maxChecks) {
      await this.sleep(checkInterval);
      checks++;

      try {
        const chunks = await this.prisma.fileChunk.findMany({
          where: { fileId },
        });

        const completed = chunks.filter((c) => c.uploadStatus === 'completed').length;
        const failed = chunks.filter((c) => c.uploadStatus === 'failed').length;
        const pending = chunks.filter((c) =>
          c.uploadStatus === 'pending' || c.uploadStatus === 'retrying'
        ).length;

        this.logger.debug(
          `[Monitor] File ${fileId}: ${completed}/${totalChunks} completed, ${failed} failed, ${pending} pending`
        );

        // All chunks processed (either completed or failed)
        if (pending === 0 && (completed + failed) === totalChunks) {
          if (failed > 0 && completed === 0) {
            // All chunks failed
            await this.prisma.file.update({
              where: { id: fileId },
              data: {
                uploadStatus: 'failed',
                updatedAt: new Date(),
              },
            });
            this.logger.error(`❌ File ${fileId} upload FAILED - all ${failed} chunk(s) failed`);
          } else if (failed > 0) {
            // Some chunks failed
            await this.prisma.file.update({
              where: { id: fileId },
              data: {
                uploadStatus: 'partial',
                updatedAt: new Date(),
              },
            });
            this.logger.warn(`⚠️ File ${fileId} upload completed PARTIALLY - ${completed}/${totalChunks} successful, ${failed} failed`);
          } else {
            // All chunks completed successfully
            await this.prisma.file.update({
              where: { id: fileId },
              data: {
                uploadStatus: 'completed',
                updatedAt: new Date(),
              },
            });
            this.logger.log(`✅ File ${fileId} upload COMPLETED successfully - ${completed}/${totalChunks} chunks`);
          }
          return;
        }
      } catch (error) {
        this.logger.error(`[Monitor] Error checking status for file ${fileId}:`, error);
        // Continue monitoring even if there's an error
      }
    }

    // Timeout - mark as failed
    this.logger.error(`⏱️ Upload monitoring TIMED OUT for file ${fileId} after ${maxChecks * checkInterval / 1000} seconds`);
    try {
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          uploadStatus: 'failed',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update file status after timeout:`, error);
    }
  }

  /**
   * Helper: sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Main upload function - returns immediately with uploading status
   */
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    enableCompression: boolean = true,
    ttl?: number,
  ): Promise<{
    fileId: string;
    status: string;
    totalSize: number;
    originalSize: number;
    compressed: boolean;
    totalChunks: number;
    message: string;
  }> {
    this.logger.log(
      `Starting upload: ${file.originalname}, size: ${file.size} bytes, compression: ${enableCompression}`
    );

    const originalSize = file.size;
    let processedBuffer = file.buffer;
    let compressed = false;

    // Determine file type category
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const isPlainFile = !isImage && !isVideo;

    // Compress based on file type
    if (enableCompression && (isImage || isVideo)) {
      if (isImage) {
        processedBuffer = await this.compressImage(file.buffer);
        compressed = true;
      } else if (isVideo) {
        processedBuffer = await this.compressVideo(file.buffer, file.originalname);
        compressed = true;
      }
    } else if (isPlainFile) {
      this.logger.log(`Plain file (${file.mimetype}), no compression`);
    }

    // Split into chunks
    const chunks = this.chunkBuffer(processedBuffer, this.CHUNK_SIZE);
    const totalChunks = chunks.length;

    this.logger.log(`File split into ${totalChunks} chunk(s)`);

    // Calculate expiration date if TTL is provided
    let expiresAt: Date | null = null;
    if (ttl && ttl > 0) {
      expiresAt = new Date(Date.now() + ttl);
      this.logger.log(`File will expire at: ${expiresAt.toISOString()}`);
    }

    // Create file record immediately
    const savedFile = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: processedBuffer.length,
        encoding: file.encoding,
        arkivAddress: 'pending', // Will be updated when first chunk completes
        userId,
        uploadStatus: 'uploading',
        expiresAt,
        chunks: {
          create: chunks.map((chunk, index) => ({
            chunkIndex: index,
            size: chunk.length,
            uploadStatus: 'pending',
            retryCount: 0,
          })),
        },
      },
    });

    // Start background upload (don't await)
    this.uploadInBackground(chunks, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId,
      fileId: savedFile.id,
    }).catch(error => {
      this.logger.error(`Background upload error for ${savedFile.id}:`, error);
    });

    // Return immediately
    return {
      fileId: savedFile.id,
      status: 'uploading',
      totalSize: processedBuffer.length,
      originalSize,
      compressed,
      totalChunks,
      message: `Upload started in background. ${totalChunks} chunk(s) will be uploaded using ${this.walletClients.length} wallet(s).`,
    };
  }

  /**
   * Get upload status
   */
  async getUploadStatus(fileId: string, userId: string) {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: 'asc',
          },
        },
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    const totalChunks = file.chunks.length;
    const completedChunks = file.chunks.filter(c => c.uploadStatus === 'completed').length;
    const failedChunks = file.chunks.filter(c => c.uploadStatus === 'failed').length;
    const pendingChunks = file.chunks.filter(c => c.uploadStatus === 'pending' || c.uploadStatus === 'retrying').length;

    return {
      fileId: file.id,
      fileName: file.originalName,
      uploadStatus: file.uploadStatus,
      totalChunks,
      completedChunks,
      failedChunks,
      pendingChunks,
      progress: totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0,
      chunks: file.chunks.map(chunk => ({
        index: chunk.chunkIndex,
        status: chunk.uploadStatus,
        retryCount: chunk.retryCount,
        arkivAddress: chunk.arkivAddress !== 'pending' ? chunk.arkivAddress : null,
      })),
    };
  }

  /**
   * Get file information and optionally retrieve data from Arkiv
   */
  async getFile(fileId: string, userId: string, includeData = false) {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: 'asc',
          },
        },
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check if file has expired
    this.checkFileExpiration(file);

    // If requested, retrieve actual data from Arkiv
    if (includeData && this.publicClient) {
      try {
        const chunksData = [];

        for (const chunk of file.chunks) {
          this.logger.log(`Retrieving chunk ${chunk.chunkIndex} from Arkiv...`);
          const entity = await this.publicClient.getEntity(chunk.arkivAddress);

          if (entity && entity.payload) {
            // Parse the JSON payload and extract the base64 data
            const payloadStr = Buffer.from(entity.payload).toString('utf-8');
            const payloadJson = JSON.parse(payloadStr);

            if (payloadJson.data) {
              const chunkBuffer = Buffer.from(payloadJson.data, 'base64');
              chunksData.push({
                index: chunk.chunkIndex,
                data: chunkBuffer,
              });
            }
          }
        }

        // Sort chunks by index and concatenate
        chunksData.sort((a, b) => a.index - b.index);
        const completeBuffer = Buffer.concat(chunksData.map(c => c.data));

        return {
          ...file,
          fileData: completeBuffer.toString('base64'),
        };
      } catch (error) {
        this.logger.error('Error retrieving file data from Arkiv:', error);
        throw new Error('Failed to retrieve file data from Arkiv');
      }
    }

    return file;
  }

  /**
   * List user files
   */
  async listUserFiles(userId: string) {
    return this.prisma.file.findMany({
      where: {
        userId,
      },
      include: {
        chunks: {
          select: {
            chunkIndex: true,
            arkivAddress: true,
            size: true,
          },
          orderBy: {
            chunkIndex: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    await this.prisma.file.delete({
      where: {
        id: fileId,
      },
    });

    return { message: 'File deleted successfully' };
  }

  /**
   * Get file by UUID (public access, no user validation)
   * Retrieves and reassembles file from Arkiv blockchain
   */
  async getFileByUuid(fileId: string): Promise<{
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    fileData: string; // base64 encoded
  }> {
    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId,
      },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: 'asc',
          },
        },
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check if file has expired
    this.checkFileExpiration(file);

    if (!this.publicClient) {
      throw new Error('Arkiv client not initialized');
    }

    try {
      this.logger.log(`Reassembling file ${file.originalName} from ${file.chunks.length} chunks`);
      const chunksData = [];

      for (const chunk of file.chunks) {
        this.logger.debug(`Retrieving chunk ${chunk.chunkIndex}/${file.chunks.length} from ${chunk.arkivAddress}`);

        if (chunk.arkivAddress === 'pending' || chunk.uploadStatus !== 'completed') {
          throw new Error(`File is not fully uploaded. Chunk ${chunk.chunkIndex} is ${chunk.uploadStatus}`);
        }

        const entity = await this.publicClient.getEntity(chunk.arkivAddress);

        if (entity && entity.payload) {
          // Parse the JSON payload and extract the base64 data
          const payloadStr = Buffer.from(entity.payload).toString('utf-8');
          const payloadJson = JSON.parse(payloadStr);

          if (payloadJson.data) {
            const chunkBuffer = Buffer.from(payloadJson.data, 'base64');
            chunksData.push({
              index: chunk.chunkIndex,
              data: chunkBuffer,
            });
            this.logger.debug(`Retrieved chunk ${chunk.chunkIndex}: ${chunkBuffer.length} bytes`);
          } else {
            throw new Error(`Chunk ${chunk.chunkIndex} has no data in payload`);
          }
        } else {
          throw new Error(`Chunk ${chunk.chunkIndex} not found in Arkiv`);
        }
      }

      // Sort chunks by index and concatenate
      chunksData.sort((a, b) => a.index - b.index);
      const completeBuffer = Buffer.concat(chunksData.map(c => c.data));

      this.logger.log(`File reassembled: ${completeBuffer.length} bytes`);

      return {
        fileId: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: completeBuffer.length,
        fileData: completeBuffer.toString('base64'),
      };
    } catch (error) {
      this.logger.error('Error retrieving file data from Arkiv:', error);
      throw new Error(`Failed to retrieve file data: ${error.message}`);
    }
  }

  /**
   * Get file as text (for JSON, text files, etc.)
   * Returns the file content as a string instead of base64
   */
  async getFileAsText(fileId: string, userId: string): Promise<{
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    content: string;
    encoding: string;
  }> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: 'asc',
          },
        },
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check if file has expired
    this.checkFileExpiration(file);

    // Verify it's a text-based file
    const isTextFile = file.mimeType.startsWith('text/') ||
      file.mimeType.includes('json') ||
      file.mimeType.includes('xml') ||
      file.mimeType.includes('yaml') ||
      file.mimeType.includes('javascript') ||
      file.mimeType.includes('typescript');

    if (!isTextFile) {
      throw new Error('File is not a text-based file. Use getFile() with includeData=true for binary files.');
    }

    try {
      const chunksData = [];

      for (const chunk of file.chunks) {
        this.logger.log(`Retrieving chunk ${chunk.chunkIndex} from Arkiv...`);
        const entity = await this.publicClient.getEntity(chunk.arkivAddress);

        if (entity && entity.payload) {
          const payloadStr = Buffer.from(entity.payload).toString('utf-8');
          const payloadJson = JSON.parse(payloadStr);

          if (payloadJson.data) {
            const chunkBuffer = Buffer.from(payloadJson.data, 'base64');
            chunksData.push({
              index: chunk.chunkIndex,
              data: chunkBuffer,
            });
          }
        }
      }

      // Sort chunks by index and concatenate
      chunksData.sort((a, b) => a.index - b.index);
      const completeBuffer = Buffer.concat(chunksData.map(c => c.data));

      // Convert to string with appropriate encoding
      const content = completeBuffer.toString('utf-8');

      return {
        fileId: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        content,
        encoding: 'utf-8',
      };
    } catch (error) {
      this.logger.error('Error retrieving text file from Arkiv:', error);
      throw new Error('Failed to retrieve text file from Arkiv');
    }
  }

  /**
   * Get file as JSON (parses JSON files automatically)
   */
  async getFileAsJson(fileId: string, userId: string): Promise<{
    fileId: string;
    originalName: string;
    data: any;
  }> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check if file has expired
    this.checkFileExpiration(file);

    if (!file.mimeType.includes('json')) {
      throw new Error('File is not a JSON file');
    }

    const textFile = await this.getFileAsText(fileId, userId);

    try {
      const data = JSON.parse(textFile.content);

      return {
        fileId: file.id,
        originalName: file.originalName,
        data,
      };
    } catch (error) {
      this.logger.error('Error parsing JSON:', error);
      throw new Error('Failed to parse JSON file');
    }
  }

  /**
   * Simple upload helper for video segments (synchronous, no background processing)
   */
  private async simpleUploadToArkiv(
    buffer: Buffer,
    metadata: {
      fileName: string;
      mimeType: string;
      size: number;
      chunkIndex?: number;
      totalChunks?: number;
      userId: string;
    },
  ): Promise<{ entityKey: string; txHash: string }> {
    const wallet = this.getNextWallet();
    const entityId = randomUUID();
    const isChunk = metadata.chunkIndex !== undefined;

    const result = await wallet.createEntity({
      payload: jsonToPayload({
        entity: {
          entityType: isChunk ? 'file-chunk' : 'file',
          entityId,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          userId: metadata.userId,
          size: metadata.size,
          uploadedAt: Date.now(),
          ...(isChunk && {
            chunkIndex: metadata.chunkIndex,
            totalChunks: metadata.totalChunks,
          }),
        },
        data: buffer.toString('base64'),
      }),
      contentType: 'application/json',
      attributes: [
        { key: 'id', value: entityId },
        { key: 'createdAt', value: Date.now().toString() },
        { key: 'type', value: isChunk ? 'file-chunk' : 'file' },
        { key: 'fileName', value: metadata.fileName },
        { key: 'mimeType', value: metadata.mimeType },
        { key: 'userId', value: metadata.userId },
        ...(isChunk
          ? [
            { key: 'chunkIndex', value: metadata.chunkIndex.toString() },
            { key: 'totalChunks', value: metadata.totalChunks.toString() },
          ]
          : []),
      ],
      expiresIn: ExpirationTime.fromDays(30),
    });

    return {
      entityKey: result.entityKey,
      txHash: result.txHash,
    };
  }

  /**
   * Update entity on Arkiv Network
   */
  async updateEntity(
    entityKey: string,
    userId: string,
    updateData: {
      title?: string;
      content?: string;
      description?: string;
      [key: string]: any;
    },
    expirationHours: number = 24,
  ): Promise<{ entityKey: string; txHash: string }> {
    // Verify that the user owns this entity
    const file = await this.prisma.file.findFirst({
      where: {
        arkivAddress: entityKey,
        userId,
      },
    });

    if (!file) {
      throw new Error('Entity not found or you do not have permission to update it');
    }

    const wallet = this.getNextWallet();
    
    // Prepare the update payload
    const updatedPayload = {
      ...updateData,
      updatedAt: Date.now(),
      lastUpdatedBy: userId,
    };

    const result = await wallet.updateEntity({
      entityKey,
      payload: jsonToPayload(updatedPayload),
      contentType: 'application/json',
      attributes: [
        { key: 'type', value: 'file' },
        { key: 'updated', value: Date.now().toString() },
        { key: 'updatedBy', value: userId },
        ...(updateData.title ? [{ key: 'title', value: updateData.title }] : []),
        ...(updateData.description ? [{ key: 'description', value: updateData.description }] : []),
      ],
      expiresIn: ExpirationTime.fromHours(expirationHours),
    });

    // Update the file record in database
    await this.prisma.file.update({
      where: { id: file.id },
      data: {
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Entity ${entityKey} updated by user ${userId}`);
    
    return {
      entityKey,
      txHash: result.txHash,
    };
  }

  /**
   * Query entities using the new query system
   */
  async queryEntities(
    filters: {
      type?: string;
      userId?: string;
      fileName?: string;
      [key: string]: any;
    },
    options: {
      withAttributes?: boolean;
      withPayload?: boolean;
      limit?: number;
    } = {},
  ) {
    const { eq } = await import('@arkiv-network/sdk/query');
    
    const query = this.publicClient.buildQuery();
    
    // Apply filters
    if (filters.type) {
      query.where(eq('type', filters.type));
    }
    
    if (filters.userId) {
      query.where(eq('userId', filters.userId));
    }
    
    if (filters.fileName) {
      query.where(eq('fileName', filters.fileName));
    }
    
    // Apply additional filters
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== 'type' && key !== 'userId' && key !== 'fileName' && value !== undefined) {
        query.where(eq(key, value));
      }
    });
    
    // Apply options
    if (options.withAttributes) {
      query.withAttributes(true);
    }
    
    if (options.withPayload) {
      query.withPayload(true);
    }
    
    if (options.limit) {
      query.limit(options.limit);
    }
    
    const results = await query.fetch();
    
    this.logger.log(`Query returned ${results.length} entities`);
    
    return results;
  }

  /**
   * Get upload pool statistics
   */
  getPoolStats() {
    return this.uploadPool.getPoolStats();
  }

  /**
   * Get wallets statistics (legacy method, use getPoolStats instead)
   */
  getWalletsStats() {
    return {
      totalWallets: this.walletClients.length,
      currentWalletIndex: this.currentWalletIndex,
      nextWalletAddress: this.walletClients[this.currentWalletIndex]?.account?.address || 'N/A',
      loadBalancing: 'sequential (via upload pool)',
      wallets: this.walletClients.map((client, index) => ({
        index: index + 1,
        address: client.account.address,
        isNext: index === this.currentWalletIndex,
      })),
    };
  }
}
