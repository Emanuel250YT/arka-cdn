import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if FFmpeg is installed and accessible
 */
export async function checkFFmpegInstalled(): Promise<{
  installed: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    return {
      installed: true,
      version,
    };
  } catch (error) {
    return {
      installed: false,
      error: error.message,
    };
  }
}

/**
 * Get FFmpeg capabilities
 */
export async function getFFmpegCapabilities(): Promise<{
  hasLibx264: boolean;
  hasAAC: boolean;
  hasDASH: boolean;
}> {
  try {
    const { stdout } = await execAsync('ffmpeg -codecs');
    return {
      hasLibx264: stdout.includes('libx264'),
      hasAAC: stdout.includes('aac'),
      hasDASH: stdout.includes('dash'),
    };
  } catch (error) {
    return {
      hasLibx264: false,
      hasAAC: false,
      hasDASH: false,
    };
  }
}
