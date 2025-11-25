// ConfigAccess import removed - using Repository.getConfig() directly
import { compareStats } from "../utils/compareStats.ts"
import { join } from "../utils/join.ts"
import { normalizeStats } from "../utils/normalizeStats.ts"
import { shasum } from "../utils/shasum.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import type { Repository } from "../core-utils/Repository.ts"
import type { Stat } from './FileSystem.ts'
import type { WalkerEntry } from './Walker.ts'

import { GitObject } from './GitObject.ts'

type WorkdirEntry = {
  _fullpath: string
  _type: false | 'tree' | 'blob' | 'special'
  _mode: false | number
  _stat: false | Stat | undefined
  _content: false | Uint8Array | undefined
  _oid: false | string | undefined
  _actualSize?: number
}

export class GitWalkerFs {
  private repo: Repository
  ConstructEntry: new (fullpath: string) => WorkdirEntry

  constructor({ repo }: { repo: Repository }) {
    this.repo = repo
    const walker = this
    this.ConstructEntry = class WorkdirEntry {
      _fullpath: string
      _type: false | 'tree' | 'blob' | 'special' = false
      _mode: false | number = false
      _stat: false | Stat | undefined = false
      _content: false | Uint8Array | undefined = false
      _oid: false | string | undefined = false
      _actualSize?: number

      constructor(fullpath: string) {
        this._fullpath = fullpath
        this._type = false
        this._mode = false
        this._stat = false
        this._content = false
        this._oid = false
      }

      async type(): Promise<'tree' | 'blob' | 'special'> {
        return walker.type(this)
      }

      async mode(): Promise<number> {
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
    } as new (fullpath: string) => WorkdirEntry
  }

  async readdir(entry: WorkdirEntry): Promise<string[] | null> {
    const filepath = entry._fullpath
    // CRITICAL: Use repo.getDir() instead of repo.dir to ensure we get the correct workdir
    // repo.dir is a private property and may not be initialized correctly
    const dir = await this.repo.getDir()
    if (!dir) {
      throw new Error('Cannot readdir in bare repository')
    }
    const normalizedFs = createFileSystem(this.repo.fs)
    const names = await normalizedFs.readdir(join(dir, filepath))
    if (names === null) return null
    return names.map(name => join(filepath, name))
  }

  async type(entry: WorkdirEntry): Promise<'tree' | 'blob' | 'special'> {
    if (entry._type === false) {
      const stat = await this.stat(entry)
      // If stat returns undefined, the file doesn't exist
      // We can't determine the type, but we need to return something
      // Return 'blob' as a default (though this entry shouldn't be used)
      if (!stat) {
        entry._type = 'blob' // Default to blob if file doesn't exist
        return 'blob'
      }
    }
    return entry._type as 'tree' | 'blob' | 'special'
  }

  async mode(entry: WorkdirEntry): Promise<number> {
    if (entry._mode === false) {
      const stat = await this.stat(entry)
      // If stat returns undefined, the file doesn't exist
      // Return a default mode (though this entry shouldn't be used)
      if (!stat) {
        entry._mode = 0o100644 // Default file mode
        return 0o100644
      }
    }
    return entry._mode as number
  }

  async stat(entry: WorkdirEntry): Promise<Stat | undefined> {
    if (entry._stat === false) {
      // CRITICAL: Use repo.getDir() instead of repo.dir to ensure we get the correct workdir
      const dir = await this.repo.getDir()
      if (!dir) {
        throw new Error('Cannot stat in bare repository')
      }
      const normalizedFs = createFileSystem(this.repo.fs)
      let stat = await normalizedFs.lstat(`${dir}/${entry._fullpath}`)
      if (!stat) {
        // File doesn't exist in workdir - return undefined instead of throwing
        // This allows walk() to handle files that exist in other trees (e.g., HEAD, STAGE) but not in workdir
        entry._stat = undefined
        entry._type = false
        entry._mode = false
        return undefined
      }
      let type: 'tree' | 'blob' | 'special' = (stat as any).isDirectory() ? 'tree' : 'blob'
      if (type === 'blob' && !(stat as any).isFile() && !(stat as any).isSymbolicLink()) {
        type = 'special'
      }
      entry._type = type
      const normalizedStat = normalizeStats(stat)
      entry._mode = normalizedStat.mode
      // workaround for a BrowserFS edge case
      if (normalizedStat.size === -1 && entry._actualSize) {
        normalizedStat.size = entry._actualSize
      }
      entry._stat = normalizedStat
    }
    return entry._stat
  }

  async content(entry: WorkdirEntry): Promise<Uint8Array | undefined> {
    if (entry._content === false) {
      // CRITICAL: Use repo.getDir() instead of repo.dir to ensure we get the correct workdir
      const dir = await this.repo.getDir()
      if (!dir) {
        throw new Error('Cannot read content in bare repository')
      }
      const gitdir = await this.repo.getGitdir()
      const fs = this.repo.fs
      const normalizedFs = createFileSystem(fs)
      if ((await this.type(entry)) === 'tree') {
        entry._content = undefined
      } else {
        // CRITICAL: Use Repository's config service directly instead of cached ConfigAccess
        // This ensures we always get the latest config values, even after setConfig() calls
        const configService = await this.repo.getConfig()
        const autocrlf = (await configService.get('core.autocrlf')) as string | undefined
        const content = await normalizedFs.read(`${dir}/${entry._fullpath}`, { autocrlf })
        if (content) {
          const contentBuffer = UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content as string | Uint8Array)
          // workaround for a BrowserFS edge case
          entry._actualSize = contentBuffer.length
          if (entry._stat && entry._stat.size === -1) {
            entry._stat.size = entry._actualSize
          }
          entry._content = new Uint8Array(contentBuffer)
        } else {
          entry._content = undefined
        }
      }
    }
    return entry._content
  }

  async oid(entry: WorkdirEntry): Promise<string | undefined> {
    if (entry._oid === false) {
      let oid: string | undefined
      // See if we can use the SHA1 hash in the index.
      const index = await this.repo.readIndexDirect()
      if (!index) {
        return undefined
      }
      const stage = index.entriesMap.get(entry._fullpath)
      const stats = await this.stat(entry)
      if (!stats) {
        oid = undefined
      } else {
        // CRITICAL: Use Repository's config service directly instead of cached ConfigAccess
        // This ensures we always get the latest config values, even after setConfig() calls
        const configService = await this.repo.getConfig()
        const filemode = (await configService.get('core.filemode')) as boolean | undefined
        const trustino =
          typeof process !== 'undefined'
            ? !(process.platform === 'win32')
            : true
        if (!stage || compareStats(stats, stage, filemode, trustino)) {
          const content = await this.content(entry)
          if (content === undefined) {
            oid = undefined
          } else {
            oid = await shasum(
              GitObject.wrap({ type: 'blob', object: content })
            )
            // Update the stats in the index so we will get a "cache hit" next time
            // 1) if we can (because the oid and mode are the same)
            // 2) and only if we need to (because other stats differ)
            if (
              stage &&
              oid === stage.oid &&
              (!filemode || stats.mode === stage.mode) &&
              compareStats(stats, stage, filemode, trustino)
            ) {
              index.insert({
                filepath: entry._fullpath,
                stats,
                oid,
              })
              // Write the updated index back
              await this.repo.writeIndexDirect(index)
            }
          }
        } else {
          // Use the index SHA1 rather than compute it
          oid = stage.oid
        }
      }
      entry._oid = oid
    }
    return entry._oid
  }

}

