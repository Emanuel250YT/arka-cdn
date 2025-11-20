/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
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
  Res,
  StreamableFile,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
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
import { UploadFileDto, UploadVideoDto, UpdateEntityDto } from './dto';

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) { }

  @Post('file')
  @ApiOperation({
    summary: 'Upload file (images, videos, documents)',
    description: `Upload a file to Arkiv Network with compression options.
    
    **Supported file types:**
    - **Images**: jpeg, jpg, png, gif (optional compression to 1080p)
    - **Videos**: mp4, avi, mov, wmv, webm, mkv (optional compression)
    - **Text files**: txt, md, csv, log, xml, html, css, js, ts, jsx, tsx
    - **Data files**: json, yaml, yml, toml, ini, conf, config
    - **Documents**: pdf
    - **Archives**: zip, tar, gz
    
    **Options:**
    - compress: Reduce file size (images and videos only)
    
    **Limits:**
    - Max size: 100MB`,
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

        ttl: {
          type: 'number',
          description: 'Time to live in milliseconds (TTL). File will expire after this time.',
          example: 86400000,
          minimum: 60000,
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
            fileId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
            arkivAddresses: { type: 'array', items: { type: 'string' }, example: ['0xabc123...', '0xdef456...'] },
            totalSize: { type: 'number', example: 1024000 },
            originalSize: { type: 'number', example: 2048000 },
            compressed: { type: 'boolean', example: true },
            chunks: { type: 'number', example: 2 },
            status: { type: 'string', example: 'completed' },
            publicUrl: { type: 'string', example: 'http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation or upload error',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'File too large' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
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

      // Upload normal con o sin compresión
      const shouldCompress = uploadFileDto.compress === true || uploadFileDto.compress === undefined;
      const result = await this.uploadService.uploadFile(
        file,
        userId,
        shouldCompress,
        uploadFileDto.ttl,
      );

      return {
        success: true,
        message: 'File uploaded successfully',
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
        message: 'Plain text upload started',
        data: {
          fileId: result.fileId,
          originalName: filename,
          size: buffer.length,
          mimeType: mimeType,
          status: result.status,
          message: result.message,
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
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
              originalName: { type: 'string', example: 'image.jpg' },
              mimeType: { type: 'string', example: 'image/jpeg' },
              size: { type: 'number', example: 1024000 },

              createdAt: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' },
              expiresAt: { type: 'string', format: 'date-time', example: null, nullable: true },
              publicUrl: { type: 'string', example: 'http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
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


  @Get('stats/wallet-pool')
  @ApiOperation({
    summary: 'Get upload pool statistics',
    description: 'Get information about upload pool queues, wallets, and processing status',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload pool statistics',
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getWalletPoolStats() {
    try {
      const stats = this.uploadService.getPoolStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Get pool stats error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get pool statistics',
      );
    }
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get upload status',
    description: 'Get the current upload status of a file, including progress and chunk information',
  })
  @ApiParam({
    name: 'id',
    description: 'File ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getUploadStatus(
    @Param('id') fileId: string,
    @GetUser('id') userId: string,
  ) {
    try {
      const status = await this.uploadService.getUploadStatus(fileId, userId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error('Get upload status error:', error);
      throw new BadRequestException(
        error.message || 'Failed to get upload status',
      );
    }
  }

  @Post('stats/wallet-pool/reset')
  @ApiOperation({
    summary: 'No-op endpoint (deprecated)',
    description: 'This endpoint is no longer needed',
  })
  @ApiResponse({
    status: 200,
    description: 'No action needed',
  })
  async resetWalletPool() {
    return {
      success: true,
      message: 'No action needed - wallet reset not required in new system',
    };
  }
}

@ApiTags('Data')
@Controller('data')
export class DataController {
  private readonly logger = new Logger(DataController.name);

  constructor(private readonly uploadService: UploadService) { }

  @Get(':uuid')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({
    summary: 'Get file by UUID (Public)',
    description: `**⚠️ PUBLIC ENDPOINT - No authentication required**
    
Retrieves and downloads files by their UUID. The file is reassembled from its chunks stored on the Arkiv blockchain and returned directly as binary data with the appropriate content type.

**Use cases:**
- Share files publicly via URL
- Embed images in HTML: \`<img src="/api/data/{uuid}">\`
- Embed videos: \`<video src="/api/data/{uuid}" controls></video>\`
- Direct file downloads

**Features:**
- No authentication required
- Returns file directly (not JSON)
- Proper Content-Type headers
- Immutable caching (1 year)
- Support for all file types`,
  })
  @ApiParam({
    name: 'uuid',
    description: 'File UUID obtained from upload response',
    type: 'string',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'File retrieved and reassembled successfully',
    content: {
      '*/*': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    headers: {
      'Content-Type': {
        description: 'MIME type of the file',
        schema: { type: 'string', example: 'image/jpeg' },
      },
      'Content-Length': {
        description: 'File size in bytes',
        schema: { type: 'number', example: 1024000 },
      },
      'Content-Disposition': {
        description: 'File name for download',
        schema: { type: 'string', example: 'inline; filename="image.jpg"' },
      },
      'Cache-Control': {
        description: 'Caching policy',
        schema: { type: 'string', example: 'public, max-age=31536000, immutable' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'File not found or UUID is invalid',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'File not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to retrieve file from Arkiv Network',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Failed to retrieve file' },
        error: { type: 'string', example: 'Internal Server Error' },
      },
    },
  })
  async getFileByUuid(
    @Param('uuid') uuid: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Retrieving file ${uuid}`);
      const result = await this.uploadService.getFileByUuid(uuid);

      // Set headers
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', result.size);
      res.setHeader('Content-Disposition', `inline; filename="${result.originalName}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      // Convert base64 to buffer and send
      const fileBuffer = Buffer.from(result.fileData, 'base64');
      res.send(fileBuffer);
    } catch (error) {
      this.logger.error(`Error retrieving file ${uuid}:`, error);
      throw new BadRequestException(
        error.message || 'Failed to retrieve file',
      );
    }
  }

  @Put(':entityKey')
  @ApiOperation({
    summary: 'Update entity on Arkiv Network',
    description: `Update an existing entity on Arkiv Network. You can only update entities that you own.
    
    **Features:**
    - Update title, content, or description
    - Add custom metadata
    - Set new expiration time
    - Maintain ownership validation
    
    **Note:** The entityKey is the Arkiv address returned when the entity was created.`,
  })
  @ApiParam({
    name: 'entityKey',
    description: 'The entity key (Arkiv address) of the entity to update',
    type: 'string',
  })
  @ApiBody({
    type: UpdateEntityDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Entity updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Entity updated successfully' },
        data: {
          type: 'object',
          properties: {
            entityKey: { type: 'string' },
            txHash: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Entity not found or access denied' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateEntity(
    @Param('entityKey') entityKey: string,
    @GetUser('id') userId: string,
    @Body() updateEntityDto: UpdateEntityDto,
  ) {
    try {
      this.logger.log(`User ${userId} updating entity: ${entityKey}`);

      const { customData, expirationHours, ...updateData } = updateEntityDto;
      const finalUpdateData = { ...updateData, ...customData };

      const result = await this.uploadService.updateEntity(
        entityKey,
        userId,
        finalUpdateData,
        expirationHours,
      );

      return {
        success: true,
        message: 'Entity updated successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Update entity error:`, error);
      throw new BadRequestException(
        error.message || 'Failed to update entity',
      );
    }
  }

  @Get('query')
  @ApiOperation({
    summary: 'Query entities using Arkiv query system',
    description: `Query entities on Arkiv Network using the new query system with filters.
    
    **Query Parameters:**
    - type: Filter by entity type (e.g., 'file', 'file-chunk')
    - userId: Filter by user ID
    - fileName: Filter by file name
    - withAttributes: Include attributes in response (default: true)
    - withPayload: Include payload data in response (default: false)
    - limit: Maximum number of results (default: 50)
    
    **Note:** Only returns entities you have access to read.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Entities retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Entities retrieved successfully' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityKey: { type: 'string' },
              attributes: { type: 'object' },
              payload: { type: 'object' },
              createdAt: { type: 'number' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            filters: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async queryEntities(
    @GetUser('id') userId: string,
    @Query('type') type?: string,
    @Query('fileName') fileName?: string,
    @Query('withAttributes') withAttributes?: string,
    @Query('withPayload') withPayload?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      this.logger.log(`User ${userId} querying entities with filters:`, {
        type,
        fileName,
        withAttributes,
        withPayload,
        limit,
      });

      const filters = {
        userId, // Always filter by current user
        ...(type && { type }),
        ...(fileName && { fileName }),
      };

      const options = {
        withAttributes: withAttributes !== 'false',
        withPayload: withPayload === 'true',
        limit: limit ? parseInt(limit, 10) : 50,
      };

      const entities = await this.uploadService.queryEntities(filters, options);

      return {
        success: true,
        message: 'Entities retrieved successfully',
        data: entities,
        meta: {
          total: entities.length,
          filters,
          options,
        },
      };
    } catch (error) {
      this.logger.error(`Query entities error:`, error);
      throw new BadRequestException(
        error.message || 'Failed to query entities',
      );
    }
  }
}
