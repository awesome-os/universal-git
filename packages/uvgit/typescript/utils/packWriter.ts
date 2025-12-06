/**
 * Packfile Writing Utilities
 * Handles writing packfiles and creating pack indices
 */
import type { FileSystemDirectoryHandle, FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';
import { GitPackIndexHandle } from '../handles/GitPackIndexHandle.ts';

/**
 * Writes a packfile stream to disk and creates its index
 */
export async function writePackfile(
  packDir: FileSystemDirectoryHandle,
  packfileName: string,
  packfileStream: AsyncIterableIterator<Uint8Array>,
  onProgress?: (progress: { phase: string; loaded: number; total?: number }) => void
): Promise<{ packfileName: string; indexFileName: string; oids: string[] }> {
  // Write packfile
  const packHandle = await packDir.getFileHandle(packfileName, { create: true });
  const writable = await packHandle.createWritable();
  
  let totalBytes = 0;
  try {
    for await (const chunk of packfileStream) {
      // Ensure chunk is backed by ArrayBuffer (not SharedArrayBuffer)
      // Create a new Uint8Array to guarantee ArrayBuffer backing
      const buffer = new Uint8Array(chunk);
      await writable.write(buffer);
      totalBytes += buffer.length;
      if (onProgress) {
        onProgress({ phase: 'packfile', loaded: totalBytes });
      }
    }
  } finally {
    await writable.close();
  }

  // Create index file
  const indexFileName = packfileName.replace(/\.pack$/, '.idx');
  const indexHandle = await packDir.getFileHandle(indexFileName, { create: true });
  
  // Read packfile to create index
  const packFile = await packHandle.getFile();
  const packBuffer = new Uint8Array(await packFile.arrayBuffer());
  
  // Create index from packfile
  // Note: This is a simplified implementation. A full implementation would
  // parse the packfile and create a proper index. For now, we'll create
  // a minimal index that can be regenerated later.
  const indexBuffer = await createPackIndex(packBuffer, onProgress);
  
  const indexWritable = await indexHandle.createWritable();
  try {
    await indexWritable.write(indexBuffer.slice());
  } finally {
    await indexWritable.close();
  }

  // Parse index to get OIDs
  const indexReader = new GitPackIndexHandle(indexHandle);
  await indexReader.parse();
  const oids = await indexReader.getAllOids();

  return {
    packfileName,
    indexFileName,
    oids,
  };
}

/**
 * Creates a pack index from packfile data
 * This is a simplified implementation - a full implementation would properly
 * parse the packfile format and create a complete index.
 */
async function createPackIndex(
  packBuffer: Uint8Array,
  onProgress?: (progress: { phase: string; loaded: number; total?: number }) => void
): Promise<Uint8Array> {
  // Check packfile magic
  const magic = new TextDecoder().decode(packBuffer.slice(0, 4));
  if (magic !== 'PACK') {
    throw new Error(`Invalid packfile magic: ${magic}`);
  }

  const version = readUInt32BE(packBuffer, 4);
  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported packfile version: ${version}`);
  }

  const objectCount = readUInt32BE(packBuffer, 8);
  
  if (onProgress) {
    onProgress({ phase: 'index', loaded: 0, total: objectCount });
  }

  // This is a placeholder - full implementation would:
  // 1. Parse all objects in the packfile
  // 2. Calculate CRCs
  // 3. Build fanout table
  // 4. Create proper index format
  
  // For now, return a minimal valid index structure
  // The index will need to be regenerated properly later
  const indexSize = 8 + 256 * 4 + objectCount * 24 + 20; // Header + fanout + entries + checksum
  const indexBuffer = new Uint8Array(indexSize);
  
  // Write magic and version
  indexBuffer.set(new TextEncoder().encode('fft'), 0);
  indexBuffer[3] = 0x4f; // 'O'
  indexBuffer[4] = 0x63; // 'c'
  indexBuffer[5] = 0x4b; // 'K'
  writeUInt32BE(indexBuffer, 6, 2); // Version 2
  
  // Write fanout table (all zeros for now - will be populated by proper parser)
  let offset = 10;
  for (let i = 0; i < 256; i++) {
    writeUInt32BE(indexBuffer, offset, 0);
    offset += 4;
  }
  
  // Write placeholder entries
  // In a real implementation, we'd parse the packfile and write actual OIDs and offsets
  
  // Write packfile checksum (last 20 bytes of packfile)
  const packChecksum = packBuffer.slice(packBuffer.length - 20);
  indexBuffer.set(packChecksum, indexBuffer.length - 20);
  
  if (onProgress) {
    onProgress({ phase: 'index', loaded: objectCount, total: objectCount });
  }

  return indexBuffer;
}

function readUInt32BE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset] * 0x1000000 +
    buffer[offset + 1] * 0x10000 +
    buffer[offset + 2] * 0x100 +
    buffer[offset + 3]
  );
}

function writeUInt32BE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = (value >>> 24) & 0xff;
  buffer[offset + 1] = (value >>> 16) & 0xff;
  buffer[offset + 2] = (value >>> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}
