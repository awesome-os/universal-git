import { join } from './GitPath.ts'
import { isRebaseInProgress } from './algorithms/SequencerManager.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"

type OperationState = {
  merge: { head: string; mode: string | null; message: string | null } | null
  cherryPick: { head: string } | null
  rebase: boolean
  origHead: string | null
}

/**
 * Manages repository state files for ongoing operations
 */
export class StateManager {
  private readonly fs: FileSystemProvider
  private readonly gitdir: string

  constructor(
    fs: FileSystemProvider,
    gitdir: string
  ) {
    this.fs = fs
    this.gitdir = gitdir
  }

  /**
   * Reads MERGE_HEAD OID
   */
  async getMergeHead(): Promise<string | null> {
    try {
      const content = await this.fs.read(join(this.gitdir, 'MERGE_HEAD'), 'utf8')
      return (content as string).trim()
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Writes MERGE_HEAD OID
   */
  async setMergeHead(oid: string): Promise<void> {
    await this.fs.write(join(this.gitdir, 'MERGE_HEAD'), `${oid}\n`, 'utf8')
  }

  /**
   * Removes MERGE_HEAD
   */
  async clearMergeHead(): Promise<void> {
    try {
      await this.fs.rm(join(this.gitdir, 'MERGE_HEAD'))
    } catch (err) {
      if ((err as { code?: string }).code !== 'NOENT') {
        throw err
      }
    }
  }

  /**
   * Reads CHERRY_PICK_HEAD OID
   */
  async getCherryPickHead(): Promise<string | null> {
    try {
      const content = await this.fs.read(join(this.gitdir, 'CHERRY_PICK_HEAD'), 'utf8')
      return (content as string).trim()
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Writes CHERRY_PICK_HEAD OID
   */
  async setCherryPickHead(oid: string): Promise<void> {
    await this.fs.write(join(this.gitdir, 'CHERRY_PICK_HEAD'), `${oid}\n`, 'utf8')
  }

  /**
   * Removes CHERRY_PICK_HEAD
   */
  async clearCherryPickHead(): Promise<void> {
    try {
      await this.fs.rm(join(this.gitdir, 'CHERRY_PICK_HEAD'))
    } catch (err) {
      if ((err as { code?: string }).code !== 'NOENT') {
        throw err
      }
    }
  }

  /**
   * Reads ORIG_HEAD OID
   */
  async getOrigHead(): Promise<string | null> {
    try {
      const content = await this.fs.read(join(this.gitdir, 'ORIG_HEAD'), 'utf8')
      return (content as string).trim()
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Writes ORIG_HEAD OID
   */
  async setOrigHead(oid: string): Promise<void> {
    await this.fs.write(join(this.gitdir, 'ORIG_HEAD'), `${oid}\n`, 'utf8')
  }

  /**
   * Removes ORIG_HEAD
   */
  async clearOrigHead(): Promise<void> {
    try {
      await this.fs.rm(join(this.gitdir, 'ORIG_HEAD'))
    } catch (err) {
      if ((err as { code?: string }).code !== 'NOENT') {
        throw err
      }
    }
  }

  /**
   * Reads MERGE_MODE
   */
  async getMergeMode(): Promise<string | null> {
    try {
      const content = await this.fs.read(join(this.gitdir, 'MERGE_MODE'), 'utf8')
      return (content as string).trim()
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Writes MERGE_MODE
   */
  async setMergeMode(mode: string): Promise<void> {
    await this.fs.write(join(this.gitdir, 'MERGE_MODE'), `${mode}\n`, 'utf8')
  }

  /**
   * Reads MERGE_MSG
   */
  async getMergeMsg(): Promise<string | null> {
    try {
      const content = await this.fs.read(join(this.gitdir, 'MERGE_MSG'), 'utf8')
      return (content as string).trim()
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') {
        return null
      }
      throw err
    }
  }

  /**
   * Writes MERGE_MSG
   */
  async setMergeMsg(message: string): Promise<void> {
    await this.fs.write(join(this.gitdir, 'MERGE_MSG'), `${message}\n`, 'utf8')
  }

  /**
   * Checks if a merge is in progress
   */
  async isMergeInProgress(): Promise<boolean> {
    const mergeHead = await this.getMergeHead()
    return mergeHead !== null
  }

  /**
   * Checks if a cherry-pick is in progress
   */
  async isCherryPickInProgress(): Promise<boolean> {
    const cherryPickHead = await this.getCherryPickHead()
    return cherryPickHead !== null
  }

  /**
   * Checks if a rebase is in progress
   */
  async isRebaseInProgress(): Promise<boolean> {
    return await isRebaseInProgress({ fs: this.fs, gitdir: this.gitdir })
  }

  /**
   * Gets the current operation state
   */
  async getOperationState(): Promise<OperationState> {
    const [mergeHead, cherryPickHead, origHead, rebaseInProgress, mergeMode, mergeMsg] = await Promise.all([
      this.getMergeHead(),
      this.getCherryPickHead(),
      this.getOrigHead(),
      this.isRebaseInProgress(),
      this.getMergeMode(),
      this.getMergeMsg(),
    ])

    return {
      merge: mergeHead ? { head: mergeHead, mode: mergeMode, message: mergeMsg } : null,
      cherryPick: cherryPickHead ? { head: cherryPickHead } : null,
      rebase: rebaseInProgress,
      origHead,
    }
  }

  /**
   * Clears all operation state
   */
  async clearOperationState(): Promise<void> {
    await Promise.all([
      this.clearMergeHead(),
      this.clearCherryPickHead(),
      this.clearOrigHead(),
    ])
    // Note: Rebase state is cleared via SequencerManager
  }
}

