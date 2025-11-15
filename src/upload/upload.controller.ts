import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  Logger,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UploadFileDto, UploadVideoDto } from './dto';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) { }

  @Post('file')
  @ApiOperation({
    summary: 'Upload file (images, videos, documents)',
    description: `Upload a file to Arkiv Network with compression and streaming conversion options.
    
    **Supported file types:**
    - **Images**: jpeg, jpg, png, gif (optional compression to 1080p)
    - **Videos**: mp4, avi, mov, wmv, webm, mkv (optional compression and DASH streaming)
    - **Text files**: txt, md, csv, log, xml, html, css, js, ts, jsx, tsx
    - **Data files**: json, yaml, yml, toml, ini, conf, config
    - **Documents**: pdf
    - **Archives**: zip, tar, gz
    
    **Options:**
    - compress: Reduce file size (images and videos only)
    - enableDashStreaming: Convert videos to adaptive streaming format with multiple resolutions
    
    **Limits:**
    - Max size: 100MB (without streaming) / 500MB (with streaming)`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
        description: {
          type: 'string',
          description: 'File description',
          example: 'My profile image',
        },
        compress: {
          type: 'boolean',
          description: 'Compress the file (images and videos only)',
          default: true,
          example: true,
        },
        enableDashStreaming: {
          type: 'boolean',
          description: 'Convert video to DASH streaming format (videos only)',
          default: false,
          example: false,
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo subido exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'File uploaded successfully' },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string', example: 'uuid' },
            arkivAddresses: { type: 'array', items: { type: 'string' } },
            totalSize: { type: 'number', example: 1024000 },
            originalSize: { type: 'number', example: 2048000 },
            compressed: { type: 'boolean', example: true },
            chunks: { type: 'number', example: 2 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation or upload error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileWithFormData(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB max
          new FileTypeValidator({
            fileType: /(image|video|text|application)\/(jpeg|jpg|png|gif|mp4|avi|mov|wmv|webm|mkv|json|plain|xml|pdf|zip|x-yaml|x-tar|gzip|javascript|typescript|css|html|markdown|csv)/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @GetUser('id') userId: string,
    @Body() uploadFileDto: UploadFileDto,
  ) {
    try {
      this.logger.log(`User ${userId} uploading file: ${file.originalname}`);

      // Determinar si se debe usar DASH streaming
      const isVideo = file.mimetype.startsWith('video/');
      const useDashStreaming = isVideo && uploadFileDto.enableDashStreaming;

      let result;

      if (useDashStreaming) {
        // Usar endpoint de DASH streaming
        result = await this.uploadService.uploadVideoWithDash(
          file,
          userId,
          ['1080p', '720p', '480p', '360p'],
        );
      } else {
        // Upload normal con o sin compresión
        result = await this.uploadService.uploadFile(
          file,
          userId,
          uploadFileDto.compress !== false, // Por defecto true
        );
      }

      return {
        success: true,
        message: useDashStreaming
          ? 'Video converted to DASH streaming successfully'
          : 'File uploaded successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error('Upload error:', error);
      throw new BadRequestException(
        error.message || 'Failed to upload file',
      );
    }
  }

  @Post('plain')
  @ApiOperation({
    summary: 'Upload plain text or JSON data',
    description: `Upload plain text or JSON data directly without using form-data. The data is sent as a raw JSON body.
    
    **Use cases:**
    - Upload JSON configuration files
    - Store API responses
    - Save text content
    - Store structured data
    
    **Request body format:**
    - data: The actual content (string, object, or array)
    - filename: Name for the file (e.g., "config.json", "data.txt")
    - description: Optional file description`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: {
          description: 'The content to upload (can be string, object, or array)',
          oneOf: [
            { type: 'string', example: 'Hello World' },
            { type: 'object', example: { key: 'value', config: { theme: 'dark' } } },
            { type: 'array', example: [1, 2, 3] },
          ],
        },
        filename: {
          type: 'string',
          description: 'Name for the file',
          example: 'config.json',
        },
        description: {
          type: 'string',
          description: 'Optional file description',
          example: 'Application configuration',
        },
      },
      required: ['data', 'filename'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Plain text/JSON uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Plain text uploaded successfully' },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string', example: 'uuid' },
            originalName: { type: 'string', example: 'config.json' },
            size: { type: 'number', example: 1024 },
            mimeType: { type: 'string', example: 'application/json' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid data or filename' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadPlainText(
    @GetUser('id') userId: string,
    @Body('data') data: any,
    @Body('filename') filename: string,
    @Body('description') description?: string,
  ) {
    try {
      this.logger.log(`User ${userId} uploading plain text: ${filename}`);

      if (!data || !filename) {
        throw new BadRequestException('data and filename are required');
      }

      // Convert data to JSON string or use as-is if already string
      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      // Determine mime type from filename extension
      const extension = filename.split('.').pop()?.toLowerCase();
      let mimeType = 'text/plain';

      if (extension === 'json') {
        mimeType = 'application/json';
      } else if (['yaml', 'yml'].includes(extension)) {
        mimeType = 'application/x-yaml';
      } else if (extension === 'xml') {
        mimeType = 'application/xml';
      } else if (['txt', 'md', 'log'].includes(extension)) {
        mimeType = `text/${extension === 'md' ? 'markdown' : 'plain'}`;
      }

      // Create a buffer from the content
      const buffer = Buffer.from(content, 'utf-8');

      // Create a pseudo Multer file object
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: filename,
        encoding: 'utf-8',
        mimetype: mimeType,
        size: buffer.length,
        buffer: buffer,
        stream: null,
        destination: '',
        filename: filename,
        path: '',
      };

      // Upload without compression
      const result = await this.uploadService.uploadFile(file, userId, false);

      return {
        success: true,
        message: 'Plain text uploaded successfully',
        data: {
          fileId: result.fileId,
          originalName: filename,
          size: buffer.length,
          mimeType: mimeType,
          arkivAddresses: result.arkivAddresses,
        },
      };
    } catch (error) {
      this.logger.error('Upload plain text error:', error);
      throw new BadRequestException(
        error.message || 'Failed to upload plain text',
      );
    }
  }

  @Get()
  @ApiOperation({
    summary: 'List user files',
    description: 'Get the list of all files uploaded by the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'File list retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              originalName: { type: 'string' },
              mimeType: { type: 'string' },
              size: { type: 'number' },
              isDashVideo: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listFiles(@GetUser('id') userId: string) {
    try {
      const files = await this.uploadService.listUserFiles(userId);

      return {
        success: true,
        data: files,
      };
    } catch (error) {
      this.logger.error('List files error:', error);
      throw new BadRequestException(
        error.message || 'Failed to list files',
      );
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get file information',
    description: 'Get detailed information about a specific file, optionally including file data from Arkiv',
  })
  @ApiParam({
    name: 'id',
    description: 'File ID',
    type: 'string',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'File information retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFile(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
    @Body('includeData') includeData?: boolean,
  ) {
    try {
      const file = await this.uploadService.getFile(
        fileId,
        userId,
        includeData || false,
      );

      return {
        success: true,
        data: file,
      };
    } catch (error) {
      this.logger.error('Get file error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get file',
      );
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete file',
    description: 'Delete a specific user file',
  })
  @ApiParam({
    name: 'id',
    description: 'File ID to delete',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteFile(@Param('id') fileId: string, @GetUser('id') userId: string) {
    try {
      const result = await this.uploadService.deleteFile(fileId, userId);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error('Delete file error:', error);
      throw new BadRequestException(
        error.message || 'Failed to delete file',
      );
    }
  }

  @Get(':id/text')
  @ApiOperation({
    summary: 'Get text file content',
    description: 'Get the content of a text file, JSON, XML, etc. as a string',
  })
  @ApiParam({
    name: 'id',
    description: 'File ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'File content retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string' },
            originalName: { type: 'string' },
            mimeType: { type: 'string' },
            size: { type: 'number' },
            content: { type: 'string', description: 'File content as text' },
            encoding: { type: 'string', example: 'utf-8' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 400, description: 'File is not a text type' })
  async getFileAsText(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
  ) {
    try {
      const file = await this.uploadService.getFileAsText(fileId, userId);

      return {
        success: true,
        data: file,
      };
    } catch (error) {
      this.logger.error('Get text file error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get text file',
      );
    }
  }

  @Get(':id/json')
  @ApiOperation({
    summary: 'Get parsed JSON file',
    description: 'Get and automatically parse the content of a JSON file',
  })
  @ApiParam({
    name: 'id',
    description: 'JSON file ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON parsed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string' },
            originalName: { type: 'string' },
            data: { type: 'object', description: 'Parsed JSON content' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 400, description: 'File is not JSON or could not be parsed' })
  async getFileAsJson(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
  ) {
    try {
      const file = await this.uploadService.getFileAsJson(fileId, userId);

      return {
        success: true,
        data: file,
      };
    } catch (error) {
      this.logger.error('Get JSON file error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get JSON file',
      );
    }
  }

  // ===== DASH VIDEO STREAMING ENDPOINTS =====

  @Post('video/dash')
  @ApiOperation({
    summary: 'Upload video with DASH conversion',
    description: `Upload a video and automatically convert it to DASH format with multiple resolutions for adaptive streaming.
    
    **Features:**
    - Automatic conversion to multiple resolutions (1080p, 720p, 480p, 360p)
    - Segmentation into 4-second chunks
    - MPD manifest generation
    - Decentralized storage on Arkiv Network
    
    **Note:** This process may take several minutes depending on video size.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Video file',
        },
        description: {
          type: 'string',
          description: 'Video description',
        },
        enableDash: {
          type: 'boolean',
          description: 'Enable DASH conversion',
          default: true,
        },
        resolutions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Resolutions to generate',
          example: ['1080p', '720p', '480p'],
        },
        compress: {
          type: 'boolean',
          description: 'Compress video before processing',
          default: true,
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Video converted to DASH successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string' },
            manifestUrl: { type: 'string' },
            duration: { type: 'number' },
            resolutions: { type: 'array', items: { type: 'string' } },
            totalSegments: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Conversion error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideoWithDash(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 500 * 1024 * 1024 }), // 500MB max para videos
          new FileTypeValidator({
            fileType: /video\/(mp4|avi|mov|wmv|webm|mkv)/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @GetUser('id') userId: string,
    @Body() uploadVideoDto: UploadVideoDto,
  ) {
    try {
      this.logger.log(`User ${userId} uploading video for DASH: ${file.originalname}`);

      const result = await this.uploadService.uploadVideoWithDash(
        file,
        userId,
        uploadVideoDto.resolutions || ['1080p', '720p', '480p', '360p'],
      );

      return {
        success: true,
        message: 'Video uploaded and converted to DASH successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error('DASH upload error:', error);
      throw new BadRequestException(
        error.message || 'Failed to upload and convert video to DASH',
      );
    }
  }

  @Get('video/:id/manifest')
  @ApiOperation({
    summary: 'Get video MPD manifest',
    description: 'Get the MPD manifest file needed to play the video in DASH format',
  })
  @ApiParam({
    name: 'id',
    description: 'Video ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'MPD manifest',
    content: {
      'application/dash+xml': {
        schema: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Video no encontrado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @Header('Content-Type', 'application/dash+xml')
  async getVideoManifest(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
  ) {
    try {
      const manifest = await this.uploadService.getVideoManifest(fileId, userId);
      return manifest;
    } catch (error) {
      this.logger.error('Get manifest error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get video manifest',
      );
    }
  }

  @Get('video/:id/info')
  @ApiOperation({
    summary: 'Get video streaming information',
    description: 'Get detailed information about the video in DASH format, including segments and available resolutions',
  })
  @ApiParam({
    name: 'id',
    description: 'Video ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Video streaming information',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            fileId: { type: 'string' },
            originalName: { type: 'string' },
            duration: { type: 'number' },
            resolutions: { type: 'array', items: { type: 'string' } },
            manifestUrl: { type: 'string' },
            processingStatus: { type: 'string' },
            segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  resolution: { type: 'string' },
                  arkivAddress: { type: 'string' },
                  duration: { type: 'number' },
                  size: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Video no encontrado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getVideoStreamingInfo(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
  ) {
    try {
      const info = await this.uploadService.getVideoStreamingInfo(fileId, userId);

      return {
        success: true,
        data: info,
      };
    } catch (error) {
      this.logger.error('Get video info error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get video streaming info',
      );
    }
  }
}
