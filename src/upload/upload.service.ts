import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createWalletClient, createPublicClient } from '@arkiv-network/sdk';
import { http } from '@arkiv-network/sdk';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { mendoza } from '@arkiv-network/sdk/chains';
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils';
import sharp from 'sharp';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private arkivClient: any;
  private publicClient: any;
  private readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  private readonly MAX_IMAGE_WIDTH = 1920; // 1080p width
  private readonly MAX_IMAGE_HEIGHT = 1080; // 1080p height
  private readonly IMAGE_QUALITY = 80; // Calidad de compresión
  private readonly VIDEO_RESOLUTION = '1920x1080'; // Máximo 1080p

  constructor(private prisma: PrismaService) { }

  async onModuleInit() {
    try {
      // Initialize Arkiv client with private key from environment
      const privateKey = process.env.ARKIV_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('ARKIV_PRIVATE_KEY is required in environment variables');
      }

      // Create account from private key
      const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);

      // Create public client for reading
      this.publicClient = createPublicClient({
        chain: mendoza,
        transport: http(),
      });

      // Create wallet client for writing
      this.arkivClient = createWalletClient({
        chain: mendoza,
        transport: http(),
        account,
      });

      this.logger.log('Arkiv clients initialized successfully');
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
   * Upload a single buffer to Arkiv using createEntity
   */
  private async uploadToArkiv(
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
    try {
      if (!this.arkivClient) {
        throw new Error('Arkiv client not initialized');
      }

      const entityId = randomUUID();
      const isChunk = metadata.chunkIndex !== undefined;

      this.logger.log(`Preparing to upload: ${isChunk ? `chunk ${metadata.chunkIndex + 1}/${metadata.totalChunks}` : 'full file'}, size: ${metadata.size} bytes`);

      // Create entity with proper SDK methods
      const result = await this.arkivClient.createEntity({
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
          data: buffer.toString('base64'), // Convert buffer to base64 for JSON payload
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
        expiresIn: ExpirationTime.fromDays(30), // 30 days expiration
      });

      this.logger.log(
        `Entity created on Arkiv - Key: ${result.entityKey}, TX: ${result.txHash}`,
      );

      return {
        entityKey: result.entityKey,
        txHash: result.txHash,
      };
    } catch (error) {
      this.logger.error('Error uploading to Arkiv:', error);
      this.logger.error('Error stack:', error.stack);
      throw new Error(`Failed to upload to Arkiv: ${error.message}`);
    }
  }

  /**
   * Main upload function with compression and chunking
   */
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    fileId: string;
    arkivAddresses: string[];
    totalSize: number;
    originalSize: number;
    compressed: boolean;
    chunks: number;
  }> {
    this.logger.log(
      `Uploading file: ${file.originalname}, size: ${file.size} bytes, type: ${file.mimetype}`,
    );

    const originalSize = file.size;
    let processedBuffer = file.buffer;
    let compressed = false;

    // Compress based on file type
    if (file.mimetype.startsWith('image/')) {
      processedBuffer = await this.compressImage(file.buffer);
      compressed = true;
    } else if (file.mimetype.startsWith('video/')) {
      processedBuffer = await this.compressVideo(file.buffer, file.originalname);
      compressed = true;
    }

    // Split into chunks
    const chunks = this.chunkBuffer(processedBuffer, this.CHUNK_SIZE);
    const totalChunks = chunks.length;

    this.logger.log(
      `File will be uploaded in ${totalChunks} chunk(s) of max ${this.CHUNK_SIZE} bytes`,
    );

    // Upload all chunks
    const arkivAddresses: string[] = [];
    const chunkRecords = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this.logger.log(`Uploading chunk ${i + 1}/${totalChunks}...`);

      const { entityKey, txHash } = await this.uploadToArkiv(chunk, {
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: chunk.length,
        chunkIndex: i,
        totalChunks,
        userId,
      });

      arkivAddresses.push(entityKey);
      chunkRecords.push({
        chunkIndex: i,
        arkivAddress: entityKey,
        size: chunk.length,
        txHash,
      });
    }

    // Create main file record
    const savedFile = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: processedBuffer.length,
        encoding: file.encoding,
        arkivAddress: arkivAddresses[0], // Main address (first chunk)
        userId,
        chunks: {
          create: chunkRecords,
        },
      },
    });

    return {
      fileId: savedFile.id,
      arkivAddresses,
      totalSize: processedBuffer.length,
      originalSize,
      compressed,
      chunks: totalChunks,
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
}
