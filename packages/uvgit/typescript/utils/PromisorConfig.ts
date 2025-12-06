/**
 * Promisor Configuration
 * Reads configuration for partial clone support.
 * 
 * Checks:
 * - extensions.partialClone = origin (or other remote name)
 * - remote.{name}.promisor = true
 */
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

export interface PromisorConfig {
  enabled: boolean;
  remoteName: string | null;
}

export class PromisorConfigReader {
  /**
   * Reads promisor configuration from .git/config file.
   */
  static async fromConfigFile(
    configHandle: FileSystemFileHandle
  ): Promise<PromisorConfig> {
    const file = await configHandle.getFile();
    const text = await file.text();

    // Parse INI-style config
    const config: Record<string, Record<string, string>> = {};
    let currentSection: string | null = null;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        config[currentSection] = {};
      } else if (currentSection && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        config[currentSection][key.trim()] = value;
      }
    }

    // Check for partial clone extension
    const partialClone = config['extensions']?.['partialClone'];
    if (!partialClone) {
      return { enabled: false, remoteName: null };
    }

    // Check if the remote has promisor enabled
    const remoteSection = `remote "${partialClone}"`;
    const remoteConfig = config[remoteSection] || config[`remote.${partialClone}`];
    const isPromisor = remoteConfig?.['promisor'] === 'true';

    return {
      enabled: isPromisor,
      remoteName: isPromisor ? partialClone : null,
    };
  }

  /**
   * Creates a disabled promisor config.
   */
  static disabled(): PromisorConfig {
    return { enabled: false, remoteName: null };
  }
}
