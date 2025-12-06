/**
 * Git Objects Provider
 * This is a Content-Addressable Storage (CAS) provider.
 * getHandle(['ab', '1234...']):
 *   1. Check objects/ab/1234... (Loose). Found? -> Return GitLooseObjectHandle.
 *   2. Check loaded Pack Indices (.idx).
 *   3. If OID found in Pack X at Offset Y -> Return GitPackedObjectHandle(packX, Y).
 */
import type { FileSystemHandle, FileSystemDirectoryHandle } from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './GitDirProvider.ts';
import type { GitDir } from '../GitDir.ts';
import { GitLooseObjectHandle } from '../handles/GitLooseObjectHandle.ts';
import { GitPackedObjectHandle } from '../handles/GitPackedObjectHandle.ts';
import { GitPackHandle } from '../handles/GitPackHandle.ts';
import { GitPackIndexHandle } from '../handles/GitPackIndexHandle.ts';
import { GitMultiPackIndexHandle } from '../handles/GitMultiPackIndexHandle.ts';
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';
import { writeObject } from '../utils/objectWriter.ts';
import type { GitObjectType } from '../handles/GitLooseObjectHandle.ts';
import { PromisorObjectHandle, type RemoteFetcher } from '../handles/PromisorObjectHandle.ts';
import { PromisorConfigReader } from '../utils/PromisorConfig.ts';
import { detectObjectFormat, type ObjectFormat, getOidLength } from '../utils/detectObjectFormat.ts';

interface PackIndexCache {
  indexHandle: GitPackIndexHandle;
  packHandle: GitPackHandle;
  packName: string;
}

export class GitDirObjectsProvider implements GitDirProvider {
  public readonly mountPoint = 'objects';
  private packIndexCache: Map<string, PackIndexCache> = new Map();
  private midxHandle: GitMultiPackIndexHandle | null = null;
  private midxLoaded: boolean = false;
  private oidToPackfileCache: Map<string, string> = new Map(); // OID -> packfile name cache
  private alternatesPaths: string[] | null = null; // Cached alternates paths
  private objectFormat: ObjectFormat | null = null; // Cached object format
  private objectsDirHandle: FileSystemDirectoryHandle | null = null;
  private promisorConfig: { enabled: boolean; remoteName: string | null } | null = null;
  private remoteFetcher: RemoteFetcher | null = null;
  private rootHandle: FileSystemDirectoryHandle;

  constructor(
    rootHandle: FileSystemDirectoryHandle,
    remoteFetcher?: RemoteFetcher
  ) {
    this.rootHandle = rootHandle;
    this.remoteFetcher = remoteFetcher || null;
  }

  /**
   * Sets the remote fetcher for partial clone support.
   */
  setRemoteFetcher(fetcher: RemoteFetcher): void {
    this.remoteFetcher = fetcher;
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    // If no segments, return the objects directory
    if (pathSegments.length === 0) {
      if (!this.objectsDirHandle) {
        try {
          this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
            'objects'
          );
        } catch {
          return null;
        }
      }
      return this.objectsDirHandle;
    }

    // Handle loose objects: objects/ab/cdef...
    if (pathSegments.length === 2) {
      const [prefix, suffix] = pathSegments;
      if (prefix.length === 2 && /^[0-9a-f]{2}$/i.test(prefix)) {
        // Try loose object first
        try {
          if (!this.objectsDirHandle) {
            this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
              'objects'
            );
          }
          const prefixDir = await this.objectsDirHandle.getDirectoryHandle(
            prefix
          );
          const fileHandle = await prefixDir.getFileHandle(suffix);
          return new GitLooseObjectHandle(fileHandle) as unknown as FileSystemHandle;
        } catch {
          // Loose object not found, try pack files
        }

        // Try to find in pack files
        const oid = prefix + suffix;
        
        // Check OID-to-packfile cache first
        const cachedPackfile = this.oidToPackfileCache.get(oid);
        if (cachedPackfile) {
          const packedHandle = await this.findInSpecificPack(oid, cachedPackfile, context);
          if (packedHandle) {
            return packedHandle as unknown as FileSystemHandle;
          }
          // Cache miss - remove from cache
          this.oidToPackfileCache.delete(oid);
        }
        
        // Try MIDX first (fastest)
        const packedHandle = await this.findInPacks(oid, context);
        if (packedHandle) {
          // Cache the OID -> packfile mapping
          const packName = await this.getPackfileNameForOid(oid, context);
          if (packName) {
            this.oidToPackfileCache.set(oid, packName);
          }
          return packedHandle as unknown as FileSystemHandle;
        }
        
        // Try alternates if object not found locally
        const alternateHandle = await this.findInAlternates(oid, context);
        if (alternateHandle) {
          return alternateHandle;
        }

        // If not found locally and promisor is enabled, return a promisor handle
        if (this.promisorConfig?.enabled && this.remoteFetcher) {
          return new PromisorObjectHandle(oid, this, this.remoteFetcher) as any;
        }
      }
    }

    // Handle pack directory: objects/pack
    if (pathSegments.length === 1 && pathSegments[0] === 'pack') {
      if (!this.objectsDirHandle) {
        try {
          this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
            'objects'
          );
        } catch {
          return null;
        }
      }
      try {
        return await this.objectsDirHandle.getDirectoryHandle('pack');
      } catch {
        return null;
      }
    }

    // Handle pack files: objects/pack/pack-*.pack or objects/pack/pack-*.idx
    if (pathSegments.length === 2 && pathSegments[0] === 'pack') {
      const filename = pathSegments[1];
      if (!this.objectsDirHandle) {
        try {
          this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
            'objects'
          );
        } catch {
          return null;
        }
      }

      try {
        const packDir = await this.objectsDirHandle.getDirectoryHandle('pack');
        if (filename.endsWith('.pack')) {
          const fileHandle = await packDir.getFileHandle(filename);
          return new GitPackHandle(fileHandle) as unknown as FileSystemHandle;
        } else if (filename.endsWith('.idx')) {
          const fileHandle = await packDir.getFileHandle(filename);
          return new GitPackIndexHandle(fileHandle) as unknown as FileSystemHandle;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Finds an object in pack files by OID.
   * Uses MIDX if available, otherwise falls back to individual pack indices.
   */
  private async findInPacks(
    oid: string,
    context: GitDir
  ): Promise<GitPackedObjectHandle | null> {
    // 1. Try MIDX first (fastest - single lookup across all packs)
    const midxResult = await this.findInMidx(oid, context);
    if (midxResult) {
      return midxResult;
    }

    // 2. Fall back to individual pack indices
    await this.loadPackIndices(context);

    // Search through all cached pack indices
    for (const [packName, cache] of this.packIndexCache.entries()) {
      const offset = await cache.indexHandle.lookup(oid);
      if (offset !== null) {
        return new GitPackedObjectHandle(cache.packHandle, offset, oid);
      }
    }

    return null;
  }

  /**
   * Finds an object using MIDX (multi-pack-index).
   * Returns null if MIDX doesn't exist or object not found.
   */
  private async findInMidx(
    oid: string,
    context: GitDir
  ): Promise<GitPackedObjectHandle | null> {
    // Load MIDX if not already loaded
    if (!this.midxLoaded) {
      try {
        const midxHandle = await context.resolve('objects/info/multi-pack-index');
        if (midxHandle && midxHandle.kind === 'file') {
          this.midxHandle = new GitMultiPackIndexHandle(
            midxHandle as FileSystemFileHandle
          );
          await this.midxHandle.parse();
        }
      } catch {
        // MIDX doesn't exist - that's fine, we'll use individual pack indices
      }
      this.midxLoaded = true;
    }

    if (!this.midxHandle) {
      return null;
    }

    // Lookup OID in MIDX
    const lookup = await this.midxHandle.lookup(oid);
    if (!lookup) {
      return null;
    }

    // Get packfile name from MIDX
    const packfileName = await this.midxHandle.getPackfileName(
      lookup.packfileIndex
    );
    if (!packfileName) {
      return null;
    }

    // Load the specific pack and index
    try {
      if (!this.objectsDirHandle) {
        this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
          'objects'
        );
      }
      const packDir = await this.objectsDirHandle.getDirectoryHandle('pack');
      const packHandle = await packDir.getFileHandle(packfileName);
      const packFileHandle = new GitPackHandle(packHandle);

      return new GitPackedObjectHandle(
        packFileHandle,
        lookup.offset,
        oid
      );
    } catch {
      // Pack file doesn't exist or can't be accessed
      return null;
    }
  }

  /**
   * Finds an object in a specific packfile (used for cache hits).
   */
  private async findInSpecificPack(
    oid: string,
    packfileName: string,
    context: GitDir
  ): Promise<GitPackedObjectHandle | null> {
    await this.loadPackIndices(context);
    const cache = this.packIndexCache.get(packfileName);
    if (!cache) {
      return null;
    }

    const offset = await cache.indexHandle.lookup(oid);
    if (offset !== null) {
      return new GitPackedObjectHandle(cache.packHandle, offset, oid);
    }

    return null;
  }

  /**
   * Gets the packfile name for an OID (for caching).
   */
  private async getPackfileNameForOid(
    oid: string,
    context: GitDir
  ): Promise<string | null> {
    // Check MIDX first
    if (this.midxHandle) {
      const lookup = await this.midxHandle.lookup(oid);
      if (lookup) {
        return await this.midxHandle.getPackfileName(lookup.packfileIndex);
      }
    }

    // Check individual pack indices
    await this.loadPackIndices(context);
    for (const [packName, cache] of this.packIndexCache.entries()) {
      const offset = await cache.indexHandle.lookup(oid);
      if (offset !== null) {
        return packName;
      }
    }

    return null;
  }

  /**
   * Finds an object in alternate object databases.
   */
  private async findInAlternates(
    oid: string,
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    // Load alternates if not already loaded
    if (this.alternatesPaths === null) {
      await this.loadAlternates(context);
    }

    if (!this.alternatesPaths || this.alternatesPaths.length === 0) {
      return null;
    }

    // Try each alternate path
    for (const alternatePath of this.alternatesPaths) {
      try {
        // Resolve the alternate path relative to the gitdir
        // Alternates can be absolute paths or relative to .git/objects
        const resolvedPath = alternatePath.startsWith('/')
          ? alternatePath
          : `objects/${alternatePath}`;

        const prefix = oid.substring(0, 2);
        const suffix = oid.substring(2);
        const alternateHandle = await context.resolve(
          `${resolvedPath}/${prefix}/${suffix}`
        );

        if (alternateHandle) {
          return alternateHandle;
        }
      } catch {
        // Alternate path doesn't exist or can't be accessed - try next one
        continue;
      }
    }

    return null;
  }

  /**
   * Loads alternates paths from objects/info/alternates file.
   */
  private async loadAlternates(context: GitDir): Promise<void> {
    this.alternatesPaths = [];
    try {
      const alternatesHandle = await context.resolve('objects/info/alternates');
      if (alternatesHandle && alternatesHandle.kind === 'file') {
        const file = await (alternatesHandle as FileSystemFileHandle).getFile();
        const content = await file.text();
        // Each line is a path (can be absolute or relative)
        const paths = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'));

        this.alternatesPaths = paths;
      }
    } catch {
      // Alternates file doesn't exist - that's fine
      this.alternatesPaths = [];
    }
  }

  /**
   * Loads all pack indices from objects/pack/ directory.
   * Caches them for future lookups.
   */
  private async loadPackIndices(context: GitDir): Promise<void> {
    // Check if we've already loaded indices
    if (this.packIndexCache.size > 0) {
      return;
    }

    try {
      if (!this.objectsDirHandle) {
        this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
          'objects'
        );
      }

      const packDir = await this.objectsDirHandle.getDirectoryHandle('pack');

      // List all .idx files
      const idxFiles: string[] = [];
      for await (const [name, handle] of packDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.idx')) {
          idxFiles.push(name);
        }
      }

      // Load each index and its corresponding pack file
      for (const idxName of idxFiles) {
        const packName = idxName.replace(/\.idx$/, '.pack');

        try {
          const idxHandle = await packDir.getFileHandle(idxName);
          const packHandle = await packDir.getFileHandle(packName);

          const indexHandle = new GitPackIndexHandle(idxHandle);
          const packFileHandle = new GitPackHandle(packHandle);

          // Parse the index to cache it
          await indexHandle.parse();

          this.packIndexCache.set(packName, {
            indexHandle,
            packHandle: packFileHandle,
            packName,
          });
        } catch (error) {
          // Skip this pack if we can't load it
          console.warn(`Failed to load pack ${packName}:`, error);
        }
      }
    } catch (error) {
      // Pack directory doesn't exist or can't be accessed
      // This is fine - the repo might not have any pack files
    }
  }

  /**
   * Writes a Git object to the object database (CAS write).
   * Creates a loose object file at objects/ab/cdef...
   * @param type - Object type (blob, tree, commit, tag)
   * @param content - Raw object content (without header)
   * @returns The OID of the written object
   */
  async write(
    type: GitObjectType,
    content: Uint8Array
  ): Promise<string> {
    const { oid, compressed } = await writeObject(type, content);

    // Ensure objects directory exists
    if (!this.objectsDirHandle) {
      this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
        'objects'
      );
    }

    // Create directory structure: objects/ab/
    const prefix = oid.substring(0, 2);
    const suffix = oid.substring(2);

    let prefixDir: FileSystemDirectoryHandle;
    try {
      prefixDir = await this.objectsDirHandle.getDirectoryHandle(prefix);
    } catch {
      prefixDir = await this.objectsDirHandle.getDirectoryHandle(prefix, {
        create: true,
      });
    }

    // Write the compressed object file
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await prefixDir.getFileHandle(suffix);
      // File exists, check if it's the same
      const existingFile = await fileHandle.getFile();
      const existingData = new Uint8Array(await existingFile.arrayBuffer());
      if (
        existingData.length === compressed.length &&
        existingData.every((b, i) => b === compressed[i])
      ) {
        // Same content, no need to write
        return oid;
      }
      // Different content - this shouldn't happen in a valid repo, but we'll overwrite
    } catch {
      // File doesn't exist, create it
      fileHandle = await prefixDir.getFileHandle(suffix, { create: true });
    }

    // Write the compressed data
    const writable = await fileHandle.createWritable();
    // Use slice() to create a new Uint8Array with a new ArrayBuffer
    // This ensures compatibility with FileSystemWriteChunkType
    await writable.write(compressed.slice());
    await writable.close();

    return oid;
  }

  async init(): Promise<void> {
    // Pre-load pack indices for faster lookups
    // We'll do lazy loading instead to avoid blocking initialization

    // Check for partial clone configuration and detect object format
    try {
      if (!this.objectsDirHandle) {
        this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
          'objects'
        );
      }

      // Try to read config file
      const configHandle = await this.rootHandle.getFileHandle('config');
      this.promisorConfig = await PromisorConfigReader.fromConfigFile(
        configHandle
      );
      
      // Detect object format (SHA-1 vs SHA-256)
      this.objectFormat = await detectObjectFormat(configHandle);
    } catch {
      // Config file doesn't exist or can't be read
      this.promisorConfig = PromisorConfigReader.disabled();
      this.objectFormat = 'sha1'; // Default to SHA-1
    }
  }

  /**
   * Gets the detected object format (SHA-1 or SHA-256).
   * Returns null if not yet detected.
   */
  getObjectFormat(): ObjectFormat | null {
    return this.objectFormat;
  }

  /**
   * Gets the expected OID length based on object format.
   */
  getOidLength(): number {
    return this.objectFormat ? getOidLength(this.objectFormat) : 40; // Default to SHA-1 length
  }

  /**
   * Writes a packfile to objects/pack/ directory.
   * Creates both the .pack file and its .idx index file.
   * @param packfileName - Name of the packfile (e.g., 'pack-abc123.pack')
   * @param packfileStream - Stream of packfile data
   * @param onProgress - Optional progress callback
   * @returns Object containing packfile name, index name, and list of OIDs
   */
  async writePackfile(
    packfileName: string,
    packfileStream: AsyncIterableIterator<Uint8Array>,
    onProgress?: (progress: { phase: string; loaded: number; total?: number }) => void
  ): Promise<{ packfileName: string; indexFileName: string; oids: string[] }> {
    // Ensure objects directory exists
    if (!this.objectsDirHandle) {
      this.objectsDirHandle = await this.rootHandle.getDirectoryHandle(
        'objects'
      );
    }

    // Get or create pack directory
    let packDir: FileSystemDirectoryHandle;
    try {
      packDir = await this.objectsDirHandle.getDirectoryHandle('pack');
    } catch {
      packDir = await this.objectsDirHandle.getDirectoryHandle('pack', {
        create: true,
      });
    }

    // Write packfile and create index
    const { writePackfile } = await import('../utils/packWriter.ts');
    const result = await writePackfile(packDir, packfileName, packfileStream, onProgress);

    // Invalidate pack index cache so the new pack is loaded
    this.packIndexCache.clear();
    this.midxLoaded = false;
    this.midxHandle = null;

    return result;
  }
}
