import { join } from "../../core-utils/GitPath.ts"
import type { FileSystem, FileSystemProvider, RawFileSystemProvider } from "../../models/FileSystem.ts"
import type { GitBackend } from '../GitBackend.ts'
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

// Import method implementations
import * as core from './core.ts'
import * as refs from './refs.ts'
import * as objects from './objects.ts'
import * as config from './config.ts'
import * as hooks from './hooks.ts'
import * as submodules from './submodules.ts'
import * as worktrees from './worktrees.ts'
import * as lfs from './lfs.ts'
import * as init from './init.ts'
import * as mergeMethods from './merge.ts'
import * as commit from './commit.ts'
import * as checkout from './checkout.ts'
import * as walkers from './walkers.ts'
import * as remote from './remote.ts'
import * as updateIndex from './updateIndex.ts'
import * as readBlob from './readBlob.ts'
import * as add from './add.ts'
import * as commands from './commands.ts'
import { createFileSystem } from "@awesome-os/universal-git-src/utils/createFileSystem.ts"
import fs from "node:fs"

/**
 * GitBackendFs - Filesystem-based implementation of GitBackend
 * 
 * This backend stores all Git data using the traditional filesystem structure,
 * compatible with standard Git repositories.
 * 
 * Methods are organized into separate files under GitBackendFs/ for better maintainability.
 */
export class GitBackendFs implements GitBackend {
  private readonly fs: FileSystem
  private readonly gitdir: string

  constructor(
    fs: RawFileSystemProvider | FileSystemProvider,
    gitdir: string
  ) {
    this.fs = createFileSystem(fs)
    this.gitdir = gitdir
  }

  getType(): string {
    return 'filesystem'
  }

  /**
   * Get the gitdir path
   */
  getGitdir(): string {
    return this.gitdir
  }

  /**
   * Get the filesystem instance
   */
  getFs(): FileSystem {
    return this.fs
  }

  /**
   * Get filesystem and worktree directory for merge operations
   * Returns fs and dir if available from worktreeBackend, otherwise returns fs and undefined for dir
   * This is used by MergeStream to create worktree backend for conflict file operations
   */
  getMergeWorktreeInfo(worktreeBackend?: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): {
    fs: FileSystem
    dir?: string
  } {
    const fs = this.getFs()
    let dir: string | undefined = undefined
    
    // Try to get directory from worktreeBackend
    // GitWorktreeFs has getDir() method (not getDirectory())
    if (worktreeBackend) {
      if ('getDir' in worktreeBackend && typeof worktreeBackend.getDir === 'function') {
        // GitWorktreeFs implementation
        dir = worktreeBackend.getDir()
      } else if ('getDirectory' in worktreeBackend && typeof worktreeBackend.getDirectory === 'function') {
        // Other implementations that have getDirectory()
        const result = worktreeBackend.getDirectory()
        if (result !== null) {
          dir = result
        }
      }
    }
    
    // Fallback: use parent of gitdir (for non-bare repos)
    if (!dir && this.gitdir.endsWith('.git')) {
      dir = this.gitdir.slice(0, -4) // Remove '.git' suffix
    }
    
    return { fs, dir }
  }

  // Core Metadata & Current State
  readHEAD = core.readHEAD.bind(this)
  writeHEAD = core.writeHEAD.bind(this)
  readConfig = core.readConfig.bind(this)
  writeConfig = core.writeConfig.bind(this)
  hasConfig = core.hasConfig.bind(this)
  readIndex = core.readIndex.bind(this)
  writeIndex = core.writeIndex.bind(this)
  hasIndex = core.hasIndex.bind(this)
  readDescription = core.readDescription.bind(this)
  writeDescription = core.writeDescription.bind(this)
  readStateFile = core.readStateFile.bind(this)
  writeStateFile = core.writeStateFile.bind(this)
  deleteStateFile = core.deleteStateFile.bind(this)
  listStateFiles = core.listStateFiles.bind(this)
  readSequencerFile = core.readSequencerFile.bind(this)
  writeSequencerFile = core.writeSequencerFile.bind(this)
  deleteSequencerFile = core.deleteSequencerFile.bind(this)
  listSequencerFiles = core.listSequencerFiles.bind(this)

  // References
  readRef = refs.readRef.bind(this)
  writeRef = refs.writeRef.bind(this)
  writeSymbolicRef = refs.writeSymbolicRef.bind(this)
  readSymbolicRef = refs.readSymbolicRef.bind(this)
  deleteRef = refs.deleteRef.bind(this)
  listRefs = refs.listRefs.bind(this)
  readReflog = refs.readReflog.bind(this)
  writeReflog = refs.writeReflog.bind(this)
  appendReflog = refs.appendReflog.bind(this)
  deleteReflog = refs.deleteReflog.bind(this)
  listReflogs = refs.listReflogs.bind(this)
  readPackedRefs = refs.readPackedRefs.bind(this)
  writePackedRefs = refs.writePackedRefs.bind(this)
  expandRef = refs.expandRef.bind(this)

  // Objects
  readLooseObject = objects.readLooseObject.bind(this)
  writeLooseObject = objects.writeLooseObject.bind(this)
  hasLooseObject = objects.hasLooseObject.bind(this)
  listLooseObjects = objects.listLooseObjects.bind(this)
  readPackfile = objects.readPackfile.bind(this)
  writePackfile = objects.writePackfile.bind(this)
  listPackfiles = objects.listPackfiles.bind(this)
  readPackIndex = objects.readPackIndex.bind(this)
  writePackIndex = objects.writePackIndex.bind(this)
  readPackBitmap = objects.readPackBitmap.bind(this)
  writePackBitmap = objects.writePackBitmap.bind(this)
  readODBInfoFile = objects.readODBInfoFile.bind(this)
  writeODBInfoFile = objects.writeODBInfoFile.bind(this)
  deleteODBInfoFile = objects.deleteODBInfoFile.bind(this)
  readMultiPackIndex = objects.readMultiPackIndex.bind(this)
  writeMultiPackIndex = objects.writeMultiPackIndex.bind(this)
  hasMultiPackIndex = objects.hasMultiPackIndex.bind(this)
  getObjectFormat = objects.getObjectFormat.bind(this)
  setObjectFormat = objects.setObjectFormat.bind(this)
  readObject = objects.readObject.bind(this)
  writeObject = objects.writeObject.bind(this)
  readBlob = readBlob.readBlob.bind(this)

  // Config
  getConfig = config.getConfig.bind(this)
  setConfig = config.setConfig.bind(this)
  getAllConfig = config.getAllConfig.bind(this)
  getConfigSubsections = config.getConfigSubsections.bind(this)
  getConfigSections = config.getConfigSections.bind(this)
  reloadConfig = config.reloadConfig.bind(this)

  // Hooks
  readHook = hooks.readHook.bind(this)
  writeHook = hooks.writeHook.bind(this)
  deleteHook = hooks.deleteHook.bind(this)
  listHooks = hooks.listHooks.bind(this)
  hasHook = hooks.hasHook.bind(this)
  runHook = hooks.runHook.bind(this)

  // Submodules
  readGitmodules = submodules.readGitmodules.bind(this)
  writeGitmodules = submodules.writeGitmodules.bind(this)
  parseGitmodules = submodules.parseGitmodules.bind(this)
  getSubmoduleByName = submodules.getSubmoduleByName.bind(this)
  getSubmoduleByPath = submodules.getSubmoduleByPath.bind(this)
  readSubmoduleConfig = submodules.readSubmoduleConfig.bind(this)
  writeSubmoduleConfig = submodules.writeSubmoduleConfig.bind(this)

  // Worktrees
  readWorktreeConfig = worktrees.readWorktreeConfig.bind(this)
  writeWorktreeConfig = worktrees.writeWorktreeConfig.bind(this)
  listWorktrees = worktrees.listWorktrees.bind(this)
  createWorktreeGitdir = worktrees.createWorktreeGitdir.bind(this)
  writeWorktreeHEAD = worktrees.writeWorktreeHEAD.bind(this)
  readWorktreeConfigObject = worktrees.readWorktreeConfigObject.bind(this)
  writeWorktreeConfigObject = worktrees.writeWorktreeConfigObject.bind(this)

  // LFS
  readLFSFile = lfs.readLFSFile.bind(this)
  writeLFSFile = lfs.writeLFSFile.bind(this)
  listLFSFiles = lfs.listLFSFiles.bind(this)

  // Init
  initialize = init.initialize.bind(this)
  isInitialized = init.isInitialized.bind(this)
  init = init.init.bind(this)
  existsFile = init.existsFile.bind(this)
  readShallow = init.readShallow.bind(this)
  writeShallow = init.writeShallow.bind(this)
  deleteShallow = init.deleteShallow.bind(this)
  readGitDaemonExportOk = init.readGitDaemonExportOk.bind(this)
  writeGitDaemonExportOk = init.writeGitDaemonExportOk.bind(this)
  deleteGitDaemonExportOk = init.deleteGitDaemonExportOk.bind(this)
  close = init.close.bind(this)

  // Info files
  readInfoFile = core.readInfoFile.bind(this)
  writeInfoFile = core.writeInfoFile.bind(this)
  deleteInfoFile = core.deleteInfoFile.bind(this)

  // Merge
  merge = mergeMethods.merge.bind(this)

  // Commit
  commit = commit.commit.bind(this)

  // Checkout
  checkout = checkout.checkout.bind(this)

  // Walkers
  createTreeWalker = walkers.createTreeWalker.bind(this)
  createIndexWalker = walkers.createIndexWalker.bind(this)

  // Remote
  getRemoteInfo = remote.getRemoteInfo.bind(this)
  listServerRefs = remote.listServerRefs.bind(this)

  // UpdateIndex
  updateIndex = updateIndex.updateIndex.bind(this)

  // Add
  add = add.add.bind(this)

  // Commands
  remove = commands.remove.bind(this)
  switch = commands.switchBranch.bind(this)
  status = commands.status.bind(this)
  statusMatrix = commands.statusMatrix.bind(this)
  reset = commands.reset.bind(this)
  diff = commands.diff.bind(this)
  mergeTree = commands.mergeTree.bind(this)
  sparseCheckoutInit = commands.sparseCheckoutInit.bind(this)
  sparseCheckoutSet = commands.sparseCheckoutSet.bind(this)
  sparseCheckoutList = commands.sparseCheckoutList.bind(this)

  // Worktree config (from worktrees module)
  getWorktreeConfig = worktrees.getWorktreeConfig.bind(this)
  setWorktreeConfig = worktrees.setWorktreeConfig.bind(this)
  getAllWorktreeConfig = worktrees.getAllWorktreeConfig.bind(this)
  getWorktreeConfigSubsections = worktrees.getWorktreeConfigSubsections.bind(this)
  getWorktreeConfigSections = worktrees.getWorktreeConfigSections.bind(this)
  reloadWorktreeConfig = worktrees.reloadWorktreeConfig.bind(this)

  // Helper method for OID to path conversion
  private _oidToPath(oid: string): { dir: string; file: string } {
    return {
      dir: oid.substring(0, 2),
      file: oid.substring(2),
    }
  }
}
