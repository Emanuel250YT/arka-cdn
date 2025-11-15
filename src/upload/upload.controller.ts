/* eslint-disable @typescript-eslint/no-unused-vars */
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UploadFileDto } from './dto';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) { }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB max
          new FileTypeValidator({
            fileType: /(image|video)\/(jpeg|jpg|png|gif|mp4|avi|mov|wmv|webm)/,
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

      const result = await this.uploadService.uploadFile(file, userId);

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

  @Get()
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
}
