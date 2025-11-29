import * as _fs from 'fs'
import * as os from 'os'
import { join, resolve } from 'path'

import findUp from 'find-up'
// FileSystem is not exported as subpath, use relative path
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { onExit } from 'signal-exit'

const TEMP_PATH = join(os.tmpdir(), 'ugit-test-fixture-')
const TEMP_DIRS_CREATED = new Set<string>()

export function cleanupTempDirs() {
  for (const tempDir of TEMP_DIRS_CREATED) {
    try {
      _fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore errors during cleanup
    }
  }
  TEMP_DIRS_CREATED.clear()
}

// import.meta.dirname is packages/universal-git-test-helpers/helpers
// We need to get to packages/universal-git-test-fixtures/fixtures
// Path: packages/universal-git-test-helpers/helpers -> packages/universal-git-test-helpers -> packages -> packages/universal-git-test-fixtures -> packages/universal-git-test-fixtures/fixtures
const helpersDir = resolve(import.meta.dirname, '..') // packages/universal-git-test-helpers
const packagesRoot = resolve(helpersDir, '..') // packages
const fixturesPackageRoot = resolve(packagesRoot, 'universal-git-test-fixtures') // packages/universal-git-test-fixtures
const fixturesDir = resolve(fixturesPackageRoot, 'fixtures') // packages/universal-git-test-fixtures/fixtures

export async function useTempDir(fixture: string): Promise<string> {
  // Use the fixtures package location: packages/test-fixtures/fixtures/
  // Try direct path first, then use findUp as fallback
  const directPath = join(fixturesDir, fixture)
  let fixturePath: string | undefined
  
  try {
    const stats = await _fs.promises.stat(directPath)
    if (stats.isDirectory()) {
      fixturePath = directPath
    }
  } catch {
    // If direct path doesn't work, try findUp
    fixturePath = await findUp(fixture, {
      cwd: fixturesDir,
      type: 'directory',
    }) || undefined
  }

  const tempDir = await _fs.promises.mkdtemp(TEMP_PATH)
  TEMP_DIRS_CREATED.add(tempDir)

  if (fixturePath) {
    await _fs.promises.cp(fixturePath, tempDir, { recursive: true })
  }

  return tempDir
}

export async function makeNodeFixture(fixture: string, options?: { init?: boolean; defaultBranch?: string; bare?: boolean; objectFormat?: 'sha1' | 'sha256' }) {
  onExit(cleanupTempDirs)

  const fs = new FileSystem(_fs)

  const dir = await useTempDir(fixture)
  let gitdir = await useTempDir(`${fixture}.git`)

  // If the .git fixture specific directory is empty, it means it wasn't found.
  // In that case, check if the main fixture directory has a .git folder and use that.
  try {
    const gitdirFiles = await _fs.promises.readdir(gitdir)
    if (gitdirFiles.length === 0) {
      const dotGitPath = join(dir, '.git')
      try {
        const stats = await _fs.promises.stat(dotGitPath)
        if (stats.isDirectory()) {
          gitdir = dotGitPath
        }
      } catch {
        // .git directory not found in worktree, stick with the empty gitdir (bare/fresh repo)
      }
    }
  } catch (err) {
    // Ignore errors reading gitdir
  }

  // Create backends explicitly
  const { GitBackendFs } = await import('@awesome-os/universal-git-src/backends/GitBackendFs/index.ts')
  const { createGitWorktreeBackend } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
  
  // Create GitBackend (GitBackendFs)
  const gitBackend = new GitBackendFs(fs, gitdir)
  
  // Create WorktreeBackend (GitWorktreeFs)
  const worktreeBackend = createGitWorktreeBackend({ fs, dir })

  // Create Repository instance using createRepository helper
  const { createRepository } = await import('@awesome-os/universal-git-src/core-utils/createRepository.ts')
  const repo = await createRepository({
    fs,
    dir, // Explicitly pass dir to ensure _dir is set
    gitdir, // Explicitly pass gitdir
    cache: {},
    autoDetectConfig: true,
    init: options?.init || false,
    defaultBranch: options?.defaultBranch,
    bare: options?.bare,
    objectFormat: options?.objectFormat,
  })

  return { _fs, fs, dir, gitdir, worktree: worktreeBackend, gitBackend, repo }
}

