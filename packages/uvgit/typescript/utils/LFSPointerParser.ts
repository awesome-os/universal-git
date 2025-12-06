/**
 * LFS Pointer Parser
 * Parses Git LFS pointer files.
 * 
 * LFS pointer format:
 * version https://git-lfs.github.com/spec/v1
 * oid sha256:abc123...
 * size 1234567890
 */
export interface LFSPointer {
  version: string;
  oid: string; // Full OID including hash algorithm prefix (e.g., "sha256:abc123...")
  size: number;
  extensions?: Record<string, string>; // Optional extensions
}

export class LFSPointerParser {
  /**
   * Parses an LFS pointer file.
   * @param content - The content of the pointer file
   * @returns Parsed LFS pointer
   */
  static parse(content: Uint8Array | string): LFSPointer {
    const text =
      typeof content === 'string'
        ? content
        : new TextDecoder().decode(content);

    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    const pointer: Partial<LFSPointer> = {
      extensions: {},
    };

    for (const line of lines) {
      if (line.startsWith('version ')) {
        pointer.version = line.substring(8).trim();
      } else if (line.startsWith('oid ')) {
        pointer.oid = line.substring(4).trim();
      } else if (line.startsWith('size ')) {
        pointer.size = parseInt(line.substring(5).trim(), 10);
      } else if (line.includes(' ')) {
        // Extension: key value
        const [key, ...valueParts] = line.split(' ');
        const value = valueParts.join(' ').trim();
        if (pointer.extensions) {
          pointer.extensions[key] = value;
        }
      }
    }

    if (!pointer.version || !pointer.oid || pointer.size === undefined) {
      throw new Error('Invalid LFS pointer: missing required fields');
    }

    return pointer as LFSPointer;
  }

  /**
   * Checks if content is an LFS pointer file.
   */
  static isPointer(content: Uint8Array | string): boolean {
    try {
      const text =
        typeof content === 'string'
          ? content
          : new TextDecoder().decode(content);
      return (
        text.includes('version https://git-lfs.github.com/spec/v1') &&
        text.includes('oid sha256:')
      );
    } catch {
      return false;
    }
  }

  /**
   * Creates an LFS pointer file from an object.
   */
  static create(pointer: LFSPointer): string {
    const lines: string[] = [];
    lines.push(`version ${pointer.version}`);
    lines.push(`oid ${pointer.oid}`);
    lines.push(`size ${pointer.size}`);

    if (pointer.extensions) {
      for (const [key, value] of Object.entries(pointer.extensions)) {
        lines.push(`${key} ${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
