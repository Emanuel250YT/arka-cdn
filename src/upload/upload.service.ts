/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashConverterService } from './dash-converter.service';
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
    private dashConverter: DashConverterService,
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
    } catch (error) {
      this.logger.error('Failed to initialize Arkiv client:', error);
      throw error;
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
   * Compress and resize video to max 1080p
   */
  private async compressVideo(buffer: Buffer, originalName: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const tempInputPath = join(tmpdir(), `input-${randomBytes(16).toString('hex')}-${originalName}`);
        const tempOutputPath = join(tmpdir(), `output-${randomBytes(16).toString('hex')}.mp4`);

        // Write buffer to temp file
        await writeFile(tempInputPath, buffer);

        this.logger.log('Compressing video to 1080p...');

        Ffmpeg(tempInputPath)
          .outputOptions([
            '-vf', `scale='min(${this.MAX_IMAGE_WIDTH},iw)':'min(${this.MAX_IMAGE_HEIGHT},ih)':force_original_aspect_ratio=decrease`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
          ])
          .output(tempOutputPath)
          .on('end', async () => {
            try {
              const fs = await import('fs/promises');
              const compressed = await fs.readFile(tempOutputPath);

              this.logger.log(
                `Video compressed: ${buffer.length} bytes -> ${compressed.length} bytes (${Math.round((1 - compressed.length / buffer.length) * 100)}% reduction)`,
              );

              // Clean up temp files
              await unlink(tempInputPath).catch(() => { });
              await unlink(tempOutputPath).catch(() => { });

              resolve(compressed);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', async (error) => {
            // Clean up temp files on error
            await unlink(tempInputPath).catch(() => { });
            await unlink(tempOutputPath).catch(() => { });
            reject(error);
          })
          .run();
      } catch (error) {
        this.logger.error('Error compressing video:', error);
        reject(new Error('Failed to compress video'));
      }
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
   * Upload chunks in background
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
    const totalChunks = chunks.length;
    this.logger.log(`Starting background upload of ${totalChunks} chunks for file ${metadata.fileId}`);
    this.logger.log(`Load balancing: ${this.walletClients.length} wallet(s) using round-robin distribution`);

    try {
      // Distribute chunks among wallets
      const uploadPromises = chunks.map((chunk, index) => {
        const wallet = this.getNextWallet();
        this.logger.debug(`Chunk ${index + 1}/${totalChunks} assigned to wallet: ${wallet.account.address}`);
        return this.uploadChunkToArkiv(
          chunk,
          {
            ...metadata,
            size: chunk.length,
            chunkIndex: index,
            totalChunks,
          },
          wallet
        );
      });

      // Wait for all chunks to upload
      const results = await Promise.allSettled(uploadPromises);

      // Check results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        this.logger.error(
          `Upload completed with errors: ${successful}/${totalChunks} successful, ${failed} failed`
        );

        await this.prisma.file.update({
          where: { id: metadata.fileId },
          data: { uploadStatus: 'partial' },
        });
      } else {
        this.logger.log(`All ${totalChunks} chunks uploaded successfully for file ${metadata.fileId}`);

        await this.prisma.file.update({
          where: { id: metadata.fileId },
          data: { uploadStatus: 'completed' },
        });
      }
    } catch (error) {
      this.logger.error(`Background upload failed for file ${metadata.fileId}:`, error);

      await this.prisma.file.update({
        where: { id: metadata.fileId },
        data: { uploadStatus: 'failed' },
      });
    }
  }

  /**
   * Main upload function - returns immediately with uploading status
   */
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    enableCompression: boolean = true,
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
   * Upload video with DASH conversion
   */
  async uploadVideoWithDash(
    file: Express.Multer.File,
    userId: string,
    resolutions: string[] = ['1080p', '720p', '480p', '360p'],
  ): Promise<{
    fileId: string;
    manifestUrl: string;
    duration: number;
    resolutions: string[];
    totalSegments: number;
  }> {
    this.logger.log(
      `Uploading video with DASH conversion: ${file.originalname}`,
    );

    // Crear registro inicial del archivo
    const fileRecord = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        encoding: file.encoding,
        userId,
        isDashVideo: true,
        processingStatus: 'processing',
      },
    });

    try {
      // Convertir a DASH
      this.logger.log('Converting video to DASH format...');
      const dashResult = await this.dashConverter.convertToDash(
        file.buffer,
        file.originalname,
        resolutions,
      );

      // Subir manifest a Arkiv
      this.logger.log('Uploading DASH manifest to Arkiv...');
      const manifestBuffer = Buffer.from(dashResult.manifestContent, 'utf-8');

      let manifestAddress: string;

      // Si el manifest es mayor a 16KB, dividirlo en chunks
      if (manifestBuffer.length > this.CHUNK_SIZE) {
        this.logger.log(`Manifest is ${manifestBuffer.length} bytes, splitting into chunks...`);

        const manifestChunks = this.chunkBuffer(manifestBuffer, this.CHUNK_SIZE);
        const manifestChunkAddresses: string[] = [];

        for (let i = 0; i < manifestChunks.length; i++) {
          const chunkUpload = await this.simpleUploadToArkiv(manifestChunks[i], {
            fileName: `${file.originalname}.mpd_chunk${i}`,
            mimeType: 'application/dash+xml',
            size: manifestChunks[i].length,
            chunkIndex: i,
            totalChunks: manifestChunks.length,
            userId,
          });
          manifestChunkAddresses.push(chunkUpload.entityKey);
        }

        manifestAddress = manifestChunkAddresses[0]; // Primera dirección como referencia
        this.logger.log(`Manifest uploaded in ${manifestChunks.length} chunks`);
      } else {
        // Manifest pequeño, subir directamente
        const manifestUpload = await this.simpleUploadToArkiv(manifestBuffer, {
          fileName: `${file.originalname}.mpd`,
          mimeType: 'application/dash+xml',
          size: manifestBuffer.length,
          userId,
        });
        manifestAddress = manifestUpload.entityKey;
      }

      // Subir todos los segmentos a Arkiv con control de concurrencia
      this.logger.log(
        `Uploading ${dashResult.segments.length} segments to Arkiv with controlled concurrency...`,
      );

      const segmentUploadPromises = dashResult.segments.map(async (segment, segmentIdx) => {
        // Add small delay between uploads to prevent nonce conflicts
        await new Promise(resolve => setTimeout(resolve, segmentIdx * 100));
        const segmentBuffer = await readFile(segment.path);

        // Si el segmento es mayor a 16KB, dividirlo en chunks
        if (segmentBuffer.length > this.CHUNK_SIZE) {
          this.logger.log(
            `Segment ${segment.index} (${segment.resolution}) is ${segmentBuffer.length} bytes, splitting into chunks...`,
          );

          const chunks = this.chunkBuffer(segmentBuffer, this.CHUNK_SIZE);

          // Subir todos los chunks del segmento en paralelo
          const chunkUploadPromises = chunks.map((chunk, i) =>
            this.simpleUploadToArkiv(chunk, {
              fileName: `${file.originalname}_${segment.resolution}_${segment.index}_chunk${i}`,
              mimeType: 'video/mp4',
              size: chunk.length,
              chunkIndex: i,
              totalChunks: chunks.length,
              userId,
            }).then(result => ({ ...result, index: i }))
          );

          const chunkResults = await Promise.all(chunkUploadPromises);
          chunkResults.sort((a, b) => a.index - b.index);

          this.logger.log(
            `Uploaded segment ${segment.index} (${segment.resolution}) in ${chunks.length} chunks`,
          );

          return {
            segmentIndex: segment.index,
            resolution: segment.resolution,
            arkivAddress: chunkResults[0].entityKey,
            duration: 4,
            size: segment.size,
            txHash: chunkResults[0].txHash,
          };
        } else {
          // Segmento pequeño, subir directamente
          const segmentUpload = await this.simpleUploadToArkiv(segmentBuffer, {
            fileName: `${file.originalname}_${segment.resolution}_${segment.index}`,
            mimeType: 'video/mp4',
            size: segment.size,
            userId,
          });

          this.logger.log(
            `Uploaded segment ${segment.index} (${segment.resolution}) - ${segmentUpload.entityKey}`,
          );

          return {
            segmentIndex: segment.index,
            resolution: segment.resolution,
            arkivAddress: segmentUpload.entityKey,
            duration: 4,
            size: segment.size,
            txHash: segmentUpload.txHash,
          };
        }
      });

      const segmentRecords = await Promise.all(segmentUploadPromises);
      this.logger.log(`All ${dashResult.segments.length} segments uploaded successfully`);

      // Actualizar el registro del archivo con toda la información
      await this.prisma.file.update({
        where: { id: fileRecord.id },
        data: {
          dashManifest: dashResult.manifestContent,
          dashManifestUrl: manifestAddress,
          videoDuration: dashResult.duration,
          videoResolutions: JSON.stringify(dashResult.resolutions),
          processingStatus: 'completed',
          arkivAddress: manifestAddress,
          videoSegments: {
            create: segmentRecords,
          },
        },
      });

      this.logger.log(
        `Video processing completed successfully: ${fileRecord.id}`,
      );

      return {
        fileId: fileRecord.id,
        manifestUrl: manifestAddress,
        duration: dashResult.duration,
        resolutions: dashResult.resolutions,
        totalSegments: dashResult.segments.length,
      };
    } catch (error) {
      this.logger.error('Error processing video with DASH:', error);

      // Actualizar el estado a fallido
      await this.prisma.file.update({
        where: { id: fileRecord.id },
        data: {
          processingStatus: 'failed',
        },
      });

      throw new Error(`Failed to process video with DASH: ${error.message}`);
    }
  }

  /**
   * Get video manifest
   */
  async getVideoManifest(fileId: string, userId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDashVideo: true,
      },
    });

    if (!file) {
      throw new Error('Video not found');
    }

    if (!file.dashManifest) {
      throw new Error('Video manifest not available');
    }

    return file.dashManifest;
  }

  /**
   * Get video streaming info
   */
  async getVideoStreamingInfo(fileId: string, userId: string) {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDashVideo: true,
      },
      include: {
        videoSegments: {
          orderBy: [{ resolution: 'desc' }, { segmentIndex: 'asc' }],
        },
      },
    });

    if (!file) {
      throw new Error('Video not found');
    }

    return {
      fileId: file.id,
      originalName: file.originalName,
      duration: file.videoDuration,
      resolutions: JSON.parse(file.videoResolutions || '[]'),
      manifestUrl: file.dashManifestUrl,
      processingStatus: file.processingStatus,
      segments: file.videoSegments.map((seg) => ({
        index: seg.segmentIndex,
        resolution: seg.resolution,
        arkivAddress: seg.arkivAddress,
        duration: seg.duration,
        size: seg.size,
      })),
    };
  }

  /**
   * Get wallets statistics
   */
  getWalletsStats() {
    return {
      totalWallets: this.walletClients.length,
      currentWalletIndex: this.currentWalletIndex,
      nextWalletAddress: this.walletClients[this.currentWalletIndex]?.account?.address || 'N/A',
      loadBalancing: 'round-robin',
      wallets: this.walletClients.map((client, index) => ({
        index: index + 1,
        address: client.account.address,
        isNext: index === this.currentWalletIndex,
      })),
    };
  }
}
