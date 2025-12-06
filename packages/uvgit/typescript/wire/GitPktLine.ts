/**
 * Git Packet Line Format
 * 
 * A pkt-line is a variable length binary string. The first four bytes
 * indicate the total length in hexadecimal. The pkt-len includes the
 * 4 bytes used to contain the length's hexadecimal representation.
 * 
 * A flush-pkt ("0000") is a special case.
 */
export class GitPktLine {
  /**
   * Creates a flush packet ("0000")
   */
  static flush(): Uint8Array {
    return new TextEncoder().encode('0000');
  }

  /**
   * Creates a delimiter packet ("0001")
   */
  static delim(): Uint8Array {
    return new TextEncoder().encode('0001');
  }

  /**
   * Encodes a string or buffer into a pkt-line
   */
  static encode(line: string | Uint8Array): Uint8Array {
    const data = typeof line === 'string' ? new TextEncoder().encode(line) : line;
    const length = data.length + 4;
    const hexLength = length.toString(16).padStart(4, '0');
    const header = new TextEncoder().encode(hexLength);
    
    const result = new Uint8Array(length);
    result.set(header, 0);
    result.set(data, 4);
    return result;
  }

  /**
   * Creates a stream reader for pkt-lines
   */
  static streamReader(
    stream: AsyncIterableIterator<Uint8Array>
  ): () => Promise<Uint8Array | null | true> {
    let buffer = new Uint8Array(0);
    let done = false;

    return async function read(): Promise<Uint8Array | null | true> {
      if (done) {
        return true;
      }

      // Read length header (4 bytes)
      while (buffer.length < 4) {
        const result = await stream.next();
        if (result.done) {
          done = true;
          return true;
        }
        const newBuffer = new Uint8Array(buffer.length + result.value.length);
        newBuffer.set(buffer);
        newBuffer.set(result.value, buffer.length);
        buffer = newBuffer;
      }

      // Parse length
      const lengthStr = new TextDecoder().decode(buffer.slice(0, 4));
      const length = parseInt(lengthStr, 16);

      // Flush packet
      if (length === 0) {
        buffer = buffer.slice(4);
        return null;
      }

      // Read payload
      const totalNeeded = length;
      while (buffer.length < totalNeeded) {
        const result = await stream.next();
        if (result.done) {
          done = true;
          return true;
        }
        const newBuffer = new Uint8Array(buffer.length + result.value.length);
        newBuffer.set(buffer);
        newBuffer.set(result.value, buffer.length);
        buffer = newBuffer;
      }

      // Extract payload (skip 4-byte header)
      const payload = buffer.slice(4, length);
      buffer = buffer.slice(length);

      return payload;
    };
  }
}
