import * as _fs from 'fs'
import * as os from 'os'
import { join, resolve } from 'path'

import findUp from 'find-up'
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { onExit } from 'signal-exit'

const TEMP_PATH = join(os.tmpdir(), 'isogit-test-fixture-')
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

const testsDir = resolve(import.meta.dirname, '..')
const projectRoot = resolve(testsDir, '..')

export async function useTempDir(fixture: string): Promise<string> {
  // Use the new location: tests/__fixtures__/
  // Try direct path first, then use findUp as fallback
  // Note: This logic might need adjustment if fixtures moved
  let fixturePath = await findUp(join('__fixtures__', fixture), {
    cwd: join(projectRoot, 'tests'),
    type: 'directory',
  })
  
  // Fallback to checking universal-git-test-fixtures if not found
  if (!fixturePath) {
     try {
       const fixturesPackageRoot = resolve(projectRoot, '..', 'universal-git-test-fixtures')
       const fixturesDir = resolve(fixturesPackageRoot, 'fixtures')
       const directPath = join(fixturesDir, fixture)
       const stats = await _fs.promises.stat(directPath)
       if (stats.isDirectory()) {
         fixturePath = directPath
       }
     } catch {}
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
