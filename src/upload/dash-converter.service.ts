import { Injectable, Logger } from '@nestjs/common';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, unlink, mkdir, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';

export interface DashConversionResult {
  manifestContent: string;
  segments: Array<{
    path: string;
    resolution: string;
    index: number;
    size: number;
  }>;
  duration: number;
  resolutions: string[];
}

@Injectable()
export class DashConverterService {
  private readonly logger = new Logger(DashConverterService.name);

  // Mapeo de resoluciones a dimensiones
  private readonly RESOLUTION_MAP = {
    '1080p': { width: 1920, height: 1080, bitrate: '5000k' },
    '720p': { width: 1280, height: 720, bitrate: '2800k' },
    '480p': { width: 854, height: 480, bitrate: '1400k' },
    '360p': { width: 640, height: 360, bitrate: '800k' },
  };

  /**
   * Convierte un video a formato DASH con múltiples resoluciones
   */
  async convertToDash(
    videoBuffer: Buffer,
    originalName: string,
    resolutions: string[] = ['1080p', '720p', '480p', '360p'],
  ): Promise<DashConversionResult> {
    const workDir = join(tmpdir(), `dash-${randomBytes(16).toString('hex')}`);
    const inputPath = join(workDir, `input-${originalName}`);

    try {
      // Crear directorio de trabajo
      await mkdir(workDir, { recursive: true });

      // Guardar video temporal
      await writeFile(inputPath, videoBuffer);

      this.logger.log(`Converting video to DASH format: ${originalName}`);
      this.logger.log(`Work directory: ${workDir}`);
      this.logger.log(`Target resolutions: ${resolutions.join(', ')}`);

      // Obtener información del video
      const videoInfo = await this.getVideoInfo(inputPath);
      this.logger.log(`Video info: ${JSON.stringify(videoInfo)}`);

      // Filtrar resoluciones que son mayores a la resolución original
      const validResolutions = this.filterValidResolutions(
        resolutions,
        videoInfo.width,
        videoInfo.height,
      );

      this.logger.log(`Valid resolutions: ${validResolutions.join(', ')}`);

      // Convertir a DASH
      await this.generateDashSegments(inputPath, workDir, validResolutions);

      // Leer el manifest generado
      const manifestPath = join(workDir, 'manifest.mpd');
      const manifestContent = await readFile(manifestPath, 'utf-8');

      // Leer todos los segmentos generados
      const segments = await this.collectSegments(workDir, validResolutions);

      this.logger.log(`DASH conversion completed. Generated ${segments.length} segments`);

      return {
        manifestContent,
        segments,
        duration: videoInfo.duration,
        resolutions: validResolutions,
      };
    } catch (error) {
      this.logger.error('Error converting to DASH:', error);
      throw new Error(`Failed to convert video to DASH: ${error.message}`);
    } finally {
      // Limpiar archivos temporales (opcional, puedes querer mantenerlos para debugging)
      // await this.cleanupWorkDir(workDir);
    }
  }

  /**
   * Obtiene información del video usando ffprobe
   */
  private async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      Ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(
          (s) => s.codec_type === 'video',
        );

        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
        });
      });
    });
  }

  /**
   * Filtra resoluciones válidas según la resolución original del video
   */
  private filterValidResolutions(
    requestedResolutions: string[],
    videoWidth: number,
    videoHeight: number,
  ): string[] {
    return requestedResolutions.filter((res) => {
      const resConfig = this.RESOLUTION_MAP[res];
      if (!resConfig) return false;

      // Solo incluir resoluciones menores o iguales a la original
      return resConfig.width <= videoWidth && resConfig.height <= videoHeight;
    });
  }

  /**
   * Genera segmentos DASH con múltiples resoluciones
   */
  private async generateDashSegments(
    inputPath: string,
    outputDir: string,
    resolutions: string[],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = Ffmpeg(inputPath);

      // Configurar outputs para cada resolución
      resolutions.forEach((resolution, index) => {
        const config = this.RESOLUTION_MAP[resolution];
        const outputPattern = join(outputDir, `${resolution}_segment_%03d.m4s`);
        const initSegment = join(outputDir, `${resolution}_init.mp4`);

        command
          .output(outputPattern)
          .outputOptions([
            `-vf scale=${config.width}:${config.height}`,
            `-b:v ${config.bitrate}`,
            '-c:v libx264',
            '-preset fast',
            '-profile:v high',
            '-level 4.1',
            '-c:a aac',
            '-b:a 128k',
            '-ar 48000',
            '-f dash',
            `-seg_duration 4`, // Segmentos de 4 segundos
            `-init_seg_name ${resolution}_init.mp4`,
            '-use_template 1',
            '-use_timeline 1',
            '-adaptation_sets "id=0,streams=v id=1,streams=a"',
          ]);
      });

      // Generar manifest MPD
      command
        .output(join(outputDir, 'manifest.mpd'))
        .outputOptions([
          '-f dash',
          '-seg_duration 4',
          '-use_template 1',
          '-use_timeline 1',
          '-adaptation_sets "id=0,streams=v id=1,streams=a"',
        ]);

      command
        .on('end', () => {
          this.logger.log('DASH segments generated successfully');
          resolve();
        })
        .on('error', (err) => {
          this.logger.error('FFmpeg error:', err);
          reject(err);
        })
        .on('progress', (progress) => {
          this.logger.debug(`Processing: ${progress.percent}% done`);
        })
        .run();
    });
  }

  /**
   * Recolecta todos los segmentos generados
   */
  private async collectSegments(
    workDir: string,
    resolutions: string[],
  ): Promise<Array<{
    path: string;
    resolution: string;
    index: number;
    size: number;
  }>> {
    const segments = [];
    const files = await readdir(workDir);

    for (const resolution of resolutions) {
      // Buscar segmentos de esta resolución
      const segmentFiles = files.filter(
        (f) => f.startsWith(`${resolution}_segment_`) && f.endsWith('.m4s'),
      );

      for (const segmentFile of segmentFiles) {
        const fullPath = join(workDir, segmentFile);
        const stats = await readFile(fullPath);

        // Extraer el índice del nombre del archivo
        const match = segmentFile.match(/_segment_(\d+)\.m4s$/);
        const index = match ? parseInt(match[1], 10) : 0;

        segments.push({
          path: fullPath,
          resolution,
          index,
          size: stats.length,
        });
      }

      // Agregar el segmento de inicialización
      const initFile = `${resolution}_init.mp4`;
      if (files.includes(initFile)) {
        const fullPath = join(workDir, initFile);
        const stats = await readFile(fullPath);

        segments.push({
          path: fullPath,
          resolution,
          index: -1, // -1 indica segmento de inicialización
          size: stats.length,
        });
      }
    }

    return segments;
  }

  /**
   * Limpia el directorio de trabajo
   */
  private async cleanupWorkDir(workDir: string): Promise<void> {
    try {
      if (existsSync(workDir)) {
        const files = await readdir(workDir);
        for (const file of files) {
          await unlink(join(workDir, file));
        }
        // Nota: rmdir no está disponible en fs/promises en algunas versiones
        // await rmdir(workDir);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup work directory: ${error.message}`);
    }
  }
}
