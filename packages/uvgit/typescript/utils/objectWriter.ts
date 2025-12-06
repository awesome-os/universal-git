/**
 * Utilities for writing Git objects
 */
import type { GitObjectType } from '../handles/GitLooseObjectHandle.ts';

/**
 * Wraps raw content with Git object header: "type size\0content"
 */
export function wrapObject(
  type: GitObjectType,
  content: Uint8Array
): Uint8Array {
  const size = content.length;
  const header = `${type} ${size}\0`;
  const headerBytes = new TextEncoder().encode(header);
  const wrapped = new Uint8Array(headerBytes.length + content.length);
  wrapped.set(headerBytes);
  wrapped.set(content, headerBytes.length);
  return wrapped;
}

/**
 * Computes the SHA-1 hash of a buffer
 */
export async function computeSha1(buffer: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compresses a buffer using zlib deflate
 */
export async function deflate(buffer: Uint8Array): Promise<Uint8Array> {
  // Try Web Compression API first
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new CompressionStream('deflate');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      writer.write(buffer);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          chunks.push(value);
        }
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error) {
      console.warn('CompressionStream failed, trying fallback', error);
    }
  }

  // Fallback: try pako
  try {
    const pako = await import('pako');
    return pako.deflate(buffer);
  } catch (error) {
    throw new Error(
      'Zlib compression not available. Please use an environment with CompressionStream or install pako.'
    );
  }
}

/**
 * Writes a Git object and returns its OID
 * @param type - Object type (blob, tree, commit, tag)
 * @param content - Raw object content (without header)
 * @returns The OID (SHA-1 hash) of the written object
 */
export async function writeObject(
  type: GitObjectType,
  content: Uint8Array
): Promise<{ oid: string; wrapped: Uint8Array; compressed: Uint8Array }> {
  const wrapped = wrapObject(type, content);
  const oid = await computeSha1(wrapped);
  const compressed = await deflate(wrapped);
  return { oid, wrapped, compressed };
}
