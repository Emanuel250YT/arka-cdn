import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

/**
 * Temporary directory manager for video processing
 */
export class TempDirManager {
  private static readonly BASE_TEMP_DIR = join(tmpdir(), 'arka-cdn-uploads');

  /**
   * Create a temporary directory for a specific operation
   */
  static async createTempDir(prefix: string = 'upload'): Promise<string> {
    const dirName = `${prefix}-${randomBytes(16).toString('hex')}`;
    const tempPath = join(this.BASE_TEMP_DIR, dirName);

    await mkdir(tempPath, { recursive: true });
    return tempPath;
  }

  /**
   * Clean up a temporary directory
   */
  static async cleanupTempDir(tempPath: string): Promise<void> {
    try {
      await rm(tempPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Get a file path within a temp directory
   */
  static getTempFilePath(tempDir: string, filename: string): string {
    return join(tempDir, filename);
  }

  /**
   * Cleanup old temporary directories (older than 1 hour)
   */
  static async cleanupOldTempDirs(): Promise<void> {
    try {
      const { readdir, stat } = await import('fs/promises');
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      try {
        await mkdir(this.BASE_TEMP_DIR, { recursive: true });
      } catch {
        // Directory might not exist yet
        return;
      }

      const entries = await readdir(this.BASE_TEMP_DIR);

      for (const entry of entries) {
        const entryPath = join(this.BASE_TEMP_DIR, entry);
        try {
          const stats = await stat(entryPath);
          if (now - stats.mtimeMs > oneHour) {
            await rm(entryPath, { recursive: true, force: true });
          }
        } catch {
          // Ignore errors for individual entries
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Initialize base temp directory
   */
  static async initialize(): Promise<void> {
    try {
      await mkdir(this.BASE_TEMP_DIR, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }
}
