import * as _fs from 'fs'
import * as os from 'os'
import { join, resolve } from 'path'

import findUp from 'find-up'
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import onExit from 'signal-exit'

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
  const fixturePath = await findUp(join('__fixtures__', fixture), {
    cwd: join(projectRoot, 'tests'),
    type: 'directory',
  })

  const tempDir = await _fs.promises.mkdtemp(TEMP_PATH)
  TEMP_DIRS_CREATED.add(tempDir)

  if (fixturePath) {
    await _fs.promises.cp(fixturePath, tempDir, { recursive: true })
  }

  return tempDir
}

export async function makeNodeFixture(fixture: string) {
  onExit(cleanupTempDirs)

  const fs = new FileSystem(_fs)

  const dir = await useTempDir(fixture)
  const gitdir = await useTempDir(`${fixture}.git`)

  return { _fs, fs, dir, gitdir }
}

