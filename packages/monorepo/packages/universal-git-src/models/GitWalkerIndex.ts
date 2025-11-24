import { compareStrings } from "../utils/compareStrings.ts"
import { flatFileListToDirectoryStructure } from "../utils/flatFileListToDirectoryStructure.ts"
import { mode2type } from "../utils/mode2type.ts"
import { normalizeStats } from "../utils/normalizeStats.ts"
import type { FileSystemProvider, Stat } from './FileSystem.ts'

type StageEntry = {
  _fullpath: string
  _type: false | 'tree' | 'blob' | 'special' | 'commit'
  _mode: false | number | undefined
  _stat: false | Stat | undefined
  _oid: false | string | undefined
}

type Inode = {
  type: 'tree' | 'blob' | 'special' | 'commit'
  fullpath: string
  metadata: {
    oid: string
    mode: number
    [key: string]: unknown
  }
  children?: Inode[]
}

export class GitWalkerIndex {
  private repo: Awaited<ReturnType<typeof import('../core-utils/Repository.ts').Repository.open>>
  fs: FileSystemProvider
  gitdir: string
  dir?: string
  cache: Record<string, unknown>
  ConstructEntry: new (fullpath: string) => StageEntry

  constructor({
    repo,
  }: {
    repo: Awaited<ReturnType<typeof import('../core-utils/Repository.ts').Repository.open>>
  }) {
    this.repo = repo
    // Store these for compatibility with methods that expect them
    this.fs = repo.fs
    // Initialize gitdir - will be resolved when first accessed if needed
    // For now, we can try to get it synchronously if _gitdir is already set
    this.gitdir = (repo as any)._gitdir || ''
    this.dir = repo.dir || undefined
    this.cache = repo.cache
    // Don't read the index in the constructor - read it lazily when needed
    // This ensures we always get the latest index state, solving cache synchronization issues
    const walker = this
    this.ConstructEntry = class StageEntry {
      _fullpath: string
      _type: false | 'tree' | 'blob' | 'special' | 'commit' = false
      _mode: false | number = false
      _stat: false | Stat | undefined = false
      _oid: false | string = false

      constructor(fullpath: string) {
        this._fullpath = fullpath
        this._type = false
        this._mode = false
        this._stat = false
        this._oid = false
      }

      async type(): Promise<'tree' | 'blob' | 'special' | 'commit'> {
        return walker.type(this)
      }

      async mode(): Promise<number | undefined> {
        return walker.mode(this)
      }

      async stat(): Promise<Stat | undefined> {
        return walker.stat(this)
      }

      async content(): Promise<Uint8Array | void> {
        return walker.content(this)
      }

      async oid(): Promise<string | undefined> {
        return walker.oid(this)
      }
    } as new (fullpath: string) => StageEntry
  }

  /**
   * Lazy getter for the tree structure - reads the index on-demand
   * Uses the Repository instance passed in the constructor (single source of truth)
   * This ensures we see the same index state as the command that created this walker
   */
  private async getTree(): Promise<Map<string, Inode>> {
    try {
      // Use the Repository instance passed in the constructor
      // This ensures we see the same index state as add(), status(), etc.
      const index = await this.repo.readIndexDirect() // Use default force=false to get owned instance
      
      // Handle null index (empty or uninitialized)
      if (!index || !index.entries) {
        return new Map<string, Inode>()
      }
      
      // Convert index entries to tree structure
      return flatFileListToDirectoryStructure(index.entries) as unknown as Map<string, Inode>
    } catch (err) {
      // If index read fails (e.g., empty index file during parallel test execution),
      // return an empty tree structure rather than failing the walker
      // This allows walk() to continue even if the index is in a transient state
      if ((err as any).code === 'InternalError' && (err as any).data?.message === 'Index file is empty (.git/index)') {
        // Return empty tree structure for empty index
        return new Map<string, Inode>()
      }
      // Re-throw all other errors
      throw err
    }
  }

  /**
   * Invalidate the cached tree to force a fresh read on next access
   * No-op since we always read fresh - kept for API compatibility
   */
  invalidateCache(): void {
    // No-op: we always read fresh from Repository.readIndexDirect()
    // which has its own mtime-based cache
  }

  async readdir(entry: StageEntry): Promise<string[] | null> {
    const filepath = entry._fullpath
    const tree = await this.getTree()
    const inode = tree.get(filepath)
    if (!inode) return null
    if (inode.type === 'blob') return null
    if (inode.type !== 'tree') {
      throw new Error(`ENOTDIR: not a directory, scandir '${filepath}'`)
    }
    const names = (inode.children || []).map(inode => inode.fullpath)
    names.sort(compareStrings)
    return names
  }

  async type(entry: StageEntry): Promise<'tree' | 'blob' | 'special' | 'commit'> {
    if (entry._type === false) {
      await this.stat(entry)
    }
    return entry._type as 'tree' | 'blob' | 'special' | 'commit'
  }

  async mode(entry: StageEntry): Promise<number | undefined> {
    if (entry._mode === false) {
      await this.stat(entry)
    }
    return entry._mode === false ? undefined : entry._mode
  }

  async stat(entry: StageEntry): Promise<Stat | undefined> {
    if (entry._stat === false) {
      const tree = await this.getTree()
      const inode = tree.get(entry._fullpath)
      if (!inode) {
        // File doesn't exist in index - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., HEAD) but not in index
        entry._stat = undefined
        entry._type = false
        entry._mode = false
        return undefined
      }
      if (inode.type === 'tree') {
        entry._type = 'tree'
        entry._mode = undefined
        entry._stat = undefined
      } else {
        const stats = normalizeStats(inode.metadata)
        entry._type = mode2type(stats.mode)
        entry._mode = stats.mode
        entry._stat = stats
      }
    }
    return entry._stat
  }

  async content(_entry: StageEntry): Promise<Uint8Array | void> {
    // Cannot get content for an index entry
    return undefined
  }

  async oid(entry: StageEntry): Promise<string | undefined> {
    if (entry._oid === false) {
      const tree = await this.getTree()
      const inode = tree.get(entry._fullpath)
      if (!inode) {
        // File doesn't exist in index - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., HEAD) but not in index
        entry._oid = undefined
        return undefined
      }
      if (inode.type === 'tree') {
        entry._oid = undefined
      } else {
        entry._oid = inode.metadata.oid
      }
    }
    // entry._oid can be false (not yet loaded), undefined (doesn't exist), or string (loaded)
    if (typeof entry._oid === 'string') {
      return entry._oid
    }
    return undefined
  }
}

