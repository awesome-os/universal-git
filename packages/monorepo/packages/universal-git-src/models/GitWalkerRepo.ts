import { NotFoundError } from '../errors/NotFoundError.ts'
import { ObjectTypeError } from '../errors/ObjectTypeError.ts'
import { GitTree } from './GitTree.ts'
import { join } from "../utils/join.ts"
import { normalizeMode } from "../utils/normalizeMode.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { Stat } from './FileSystem.ts'
import type { TreeEntry } from './GitTree.ts'
import type { GitBackend } from '../backends/GitBackend.ts'

type TreeEntryEntry = {
  _fullpath: string
  _type: false | 'tree' | 'blob' | 'special' | 'commit'
  _mode: false | number | undefined
  _stat: false | Stat | undefined
  _content: false | Uint8Array | undefined
  _oid: false | string | undefined
}

type MapEntry = {
  type: 'tree' | 'blob' | 'special' | 'commit'
  mode: string
  path: string
  oid: string
}

export class GitWalkerRepo {
  gitBackend: GitBackend
  cache: Record<string, unknown>
  ref: string
  ConstructEntry: new (fullpath: string) => TreeEntryEntry
  // Store root entry separately to avoid Map size issues
  private rootEntryPromise: Promise<MapEntry | null>

  constructor({
    gitBackend,
    ref,
    cache,
  }: {
    gitBackend: GitBackend
    ref: string
    cache: Record<string, unknown>
  }) {
    this.gitBackend = gitBackend
    this.cache = cache
    this.ref = ref
    
    // Initialize root entry separately (never stored in map to prevent size overflow)
    this.rootEntryPromise = (async () => {
      let oid: string
      try {
        // Use gitBackend.expandRef() to resolve the ref
        oid = await this.gitBackend.expandRef(ref)
      } catch (e) {
        if (e instanceof NotFoundError) {
          // Handle fresh branches with no commits
          oid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
        } else {
          throw e
        }
      }
      // Read the commit object to get the tree OID
      const commitObj = await this.gitBackend.readObject({ oid })
      if (commitObj.type !== 'commit') {
        throw new Error(`Expected commit object, got ${commitObj.type}`)
      }
      const commitBuffer = UniversalBuffer.from(commitObj.object)
      const commitText = commitBuffer.toString('utf8')
      const treeMatch = commitText.match(/^tree ([a-f0-9]{40})/m)
      if (!treeMatch) {
        throw new Error('Commit object missing tree reference')
      }
      const treeOid = treeMatch[1]
      return {
        type: 'tree' as const,
        mode: '40000',
        path: '.',
        oid: treeOid,
      }
    })()
    
    const walker = this
    this.ConstructEntry = class TreeEntry {
      _fullpath: string
      _type: false | 'tree' | 'blob' | 'special' | 'commit' = false
      _mode: false | number = false
      _stat: false | Stat | undefined = false
      _content: false | Uint8Array | undefined = false
      _oid: false | string = false

      constructor(fullpath: string) {
        this._fullpath = fullpath
        this._type = false
        this._mode = false
        this._stat = false
        this._content = false
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

      async content(): Promise<Uint8Array | undefined> {
        return walker.content(this)
      }

      async oid(): Promise<string | undefined> {
        return walker.oid(this)
      }
    } as new (fullpath: string) => TreeEntryEntry
  }

  /**
   * Helper method to resolve an entry from the tree structure WITHOUT caching
   * This prevents Map size overflow for very large repositories
   * NEVER adds entries to the map - only uses root entry stored separately
   */
  private async resolveEntry(filepath: string): Promise<MapEntry | null> {
    // Special case: return root entry directly (stored separately, not in map)
    if (filepath === '.') {
      return await this.rootEntryPromise
    }
    
    // Always resolve entry on-demand without caching to prevent Map size overflow
    const pathParts = filepath.split('/').filter(p => p)
    let currentOid: string | undefined
    let lastTreeEntry: TreeEntry | null = null
    
    // Get root entry (stored separately, not in map)
    const rootEntry = await this.rootEntryPromise
    if (!rootEntry) {
      return null
    }
    currentOid = rootEntry.oid
    
    // Walk down the path
    for (const part of pathParts) {
      if (!currentOid) {
        return null
      }
      
      const result = await this.gitBackend.readObject({ oid: currentOid })
      if (result.type !== 'tree') {
        return null
      }
      
      const tree = GitTree.from(result.object)
      const treeEntry = tree.entries().find(e => e.path === part)
      if (!treeEntry) {
        return null
      }
      
      lastTreeEntry = treeEntry
      currentOid = treeEntry.oid
    }
    
    // Return a temporary entry WITHOUT caching it (this prevents Map size overflow)
    if (currentOid && lastTreeEntry) {
      return {
        type: lastTreeEntry.type as 'tree' | 'blob' | 'special' | 'commit',
        mode: lastTreeEntry.mode,
        path: lastTreeEntry.path,
        oid: currentOid,
      }
    }
    
    return null
  }

  async readdir(entry: TreeEntryEntry): Promise<string[] | null> {
    const filepath = entry._fullpath
    // Always resolve entry on-demand (never use map to prevent size overflow)
    const obj = await this.resolveEntry(filepath)
    if (!obj) {
      // File doesn't exist in this commit - return null instead of throwing
      // This allows walk() to handle files that exist in other trees (e.g., WORKDIR, STAGE) but not in this commit
      return null
    }
    const oid = obj.oid
    if (!oid) throw new Error(`No oid for obj ${JSON.stringify(obj)}`)
    if (obj.type !== 'tree') {
      // TODO: support submodules (type === 'commit')
      return null
    }
    
    // Extract entry name from filepath for better error context
    // If filepath is ".", entry name is "root"
    // Otherwise, entry name is the last component of the path
    const entryName = filepath === '.' ? 'root' : filepath.split('/').pop() || filepath
    
    let result: any
    try {
      result = await this.gitBackend.readObject({ oid })
    } catch (error) {
      if (error instanceof NotFoundError) {
        // If tree object doesn't exist, this might be a repository integrity issue
        // However, in some cases (like fresh repos with incomplete objects), we should
        // treat missing trees as empty trees to allow operations to continue
        // This can happen when statusMatrix tries to read HEAD tree in a fresh repo
        // where the commit exists but its tree object wasn't written yet
        // Return empty directory (no children) instead of throwing
        // This matches the behavior of treating missing trees as empty
        console.warn(`Tree object ${oid} referenced by entry "${entryName}" in ${filepath === '.' ? 'root tree' : `tree at "${filepath}"`} does not exist. Treating as empty tree.`)
        return [] // Return empty directory - no children
      }
      throw error
    }
    const type = result.type
    const object = result.object
    if (type !== obj.type) {
      throw new ObjectTypeError(oid, type, obj.type)
    }
    const tree = GitTree.from(UniversalBuffer.from(object))
    // Don't cache all entries upfront - only cache them when accessed via resolveEntry
    // This prevents Map size overflow for very large repositories
    return tree.entries().map(entry => join(filepath, entry.path))
  }

  async type(entry: TreeEntryEntry): Promise<'tree' | 'blob' | 'special' | 'commit'> {
    if (entry._type === false) {
      // Always resolve entry on-demand (never use map to prevent size overflow)
      const obj = await this.resolveEntry(entry._fullpath)
      if (!obj) {
        // File doesn't exist in this commit - return undefined type (will be handled by walk)
        // Set to false to indicate it doesn't exist, but we can't return false from this function
        // The walk function should handle null/undefined entries gracefully
        entry._type = false
        // Return a default type - this entry shouldn't be used, but we need to return something
        // The walk function will filter out entries where the walker returns null
        return 'blob' // Default to blob, though this entry shouldn't be used
      }
      entry._type = obj.type
    }
    // If _type is still false, it means the entry doesn't exist
    if (entry._type === (false as any)) {
      return 'blob' // Default to blob
    }
    return entry._type as 'tree' | 'blob' | 'special' | 'commit'
  }

  async mode(entry: TreeEntryEntry): Promise<number | undefined> {
    if (entry._mode === false) {
      // Always resolve entry on-demand (never use map to prevent size overflow)
      const obj = await this.resolveEntry(entry._fullpath)
      if (!obj) {
        // File doesn't exist in this commit - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., WORKDIR, STAGE) but not in this commit
        entry._mode = undefined as any
        return undefined
      }
      entry._mode = normalizeMode(parseInt(obj.mode, 8))
    }
    // entry._mode can be false (not yet loaded), undefined (doesn't exist), or number (loaded)
    if (typeof entry._mode === 'number') {
      return entry._mode
    }
    return undefined
  }

  async stat(_entry: TreeEntryEntry): Promise<Stat | undefined> {
    return undefined
  }

  async content(entry: TreeEntryEntry): Promise<Uint8Array | undefined> {
    if (entry._content === false) {
      // Always resolve entry on-demand (never use map to prevent size overflow)
      const obj = await this.resolveEntry(entry._fullpath)
      if (!obj) {
        // File doesn't exist in this commit - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., WORKDIR, STAGE) but not in this commit
        entry._content = undefined
        return undefined
      }
      const oid = obj.oid
      if (!oid) {
        throw new Error(`No oid for obj ${JSON.stringify(obj)}`)
      }
      const result = await this.gitBackend.readObject({ oid })
      const type = result.type
      const object = result.object
      if (type !== 'blob') {
        entry._content = undefined
      } else {
        // Convert to plain Uint8Array for compatibility
        const buf = UniversalBuffer.from(object)
        entry._content = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
      }
    }
    return entry._content
  }

  async oid(entry: TreeEntryEntry): Promise<string | undefined> {
    if (entry._oid === false) {
      // Always resolve entry on-demand (never use map to prevent size overflow)
      const obj = await this.resolveEntry(entry._fullpath)
      if (!obj) {
        // File doesn't exist in this commit - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., WORKDIR, STAGE) but not in this commit
        entry._oid = undefined
        return undefined
      }
      entry._oid = obj.oid
    }
    // entry._oid can be false (not yet loaded), undefined (doesn't exist), or string (loaded)
    if (typeof entry._oid === 'string') {
      return entry._oid
    }
    return undefined
  }
}

