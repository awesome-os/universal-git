/**
 * Ref Writing Utilities
 * High-level utilities for writing Git references
 */
import type { GitDir } from '../GitDir.ts';
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

/**
 * Writes a reference to the repository
 */
export async function writeRef(
  gitDir: GitDir,
  ref: string,
  oid: string
): Promise<void> {
  // Normalize ref path
  if (!ref.startsWith('refs/')) {
    ref = `refs/heads/${ref}`;
  }

  const handle = await gitDir.resolve(ref);
  if (!handle || handle.kind !== 'file') {
    // Need to create the ref file
    // For now, we'll resolve the parent directory and create the file
    const segments = ref.split('/');
    const fileName = segments.pop()!;
    const dirPath = segments.join('/');
    
    const dirHandle = await gitDir.resolve(dirPath);
    if (!dirHandle || dirHandle.kind !== 'directory') {
      throw new Error(`Cannot create ref: parent directory ${dirPath} does not exist`);
    }
    
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      const encoder = new TextEncoder();
      await writable.write(encoder.encode(oid + '\n'));
    } finally {
      await writable.close();
    }
  } else {
    // Update existing ref
    const { GitRefHandle } = await import('../handles/GitRefHandle.ts');
    const refHandle = new GitRefHandle(handle as FileSystemFileHandle, gitDir);
    await refHandle.updateOid(oid);
  }
}

/**
 * Writes multiple references in bulk
 */
export async function writeRefs(
  gitDir: GitDir,
  refs: Map<string, string>
): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [ref, oid] of refs.entries()) {
    promises.push(writeRef(gitDir, ref, oid));
  }
  await Promise.all(promises);
}

/**
 * Writes FETCH_HEAD file
 */
export async function writeFetchHead(
  gitDir: GitDir,
  entries: Array<{ oid: string; description: string; merge?: boolean }>
): Promise<void> {
  const handle = await gitDir.resolve('FETCH_HEAD');
  if (!handle || handle.kind !== 'file') {
    throw new Error('Cannot write FETCH_HEAD: file handle not found');
  }

  const writable = await (handle as FileSystemFileHandle).createWritable();
  try {
    const encoder = new TextEncoder();
    const lines = entries.map(
      (entry) =>
        `${entry.oid}\t${entry.description}${entry.merge ? '\tnot-for-merge' : ''}`
    );
    await writable.write(encoder.encode(lines.join('\n') + '\n'));
  } finally {
    await writable.close();
  }
}
