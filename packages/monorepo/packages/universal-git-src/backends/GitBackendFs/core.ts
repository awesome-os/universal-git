import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Core metadata and state file operations for GitBackendFs
 */

export async function readHEAD(this: GitBackendFs): Promise<string> {
  const path = join(this.getGitdir(), 'HEAD')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
  } catch {
    return 'ref: refs/heads/master'
  }
}

export async function writeHEAD(this: GitBackendFs, value: string): Promise<void> {
  const path = join(this.getGitdir(), 'HEAD')
  await this.getFs().write(path, UniversalBuffer.from(value + '\n', 'utf8'))
}

export async function readConfig(this: GitBackendFs): Promise<UniversalBuffer> {
  const path = join(this.getGitdir(), 'config')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.from(data as string | Uint8Array)
  } catch {
    return UniversalBuffer.alloc(0)
  }
}

export async function writeConfig(this: GitBackendFs, data: UniversalBuffer): Promise<void> {
  const path = join(this.getGitdir(), 'config')
  await this.getFs().write(path, data)
}

export async function hasConfig(this: GitBackendFs): Promise<boolean> {
  const path = join(this.getGitdir(), 'config')
  return this.getFs().exists(path)
}

export async function readIndex(this: GitBackendFs): Promise<UniversalBuffer> {
  const path = join(this.getGitdir(), 'index')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.from(data as string | Uint8Array)
  } catch {
    return UniversalBuffer.alloc(0)
  }
}

export async function writeIndex(this: GitBackendFs, data: UniversalBuffer): Promise<void> {
  const path = join(this.getGitdir(), 'index')
  await this.getFs().write(path, data)
}

export async function hasIndex(this: GitBackendFs): Promise<boolean> {
  const path = join(this.getGitdir(), 'index')
  return this.getFs().exists(path)
}

export async function readDescription(this: GitBackendFs): Promise<string | null> {
  const path = join(this.getGitdir(), 'description')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeDescription(this: GitBackendFs, description: string): Promise<void> {
  const path = join(this.getGitdir(), 'description')
  await this.getFs().write(path, UniversalBuffer.from(description, 'utf8'))
}

export async function readStateFile(this: GitBackendFs, name: string): Promise<string | null> {
  const path = join(this.getGitdir(), name)
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
  } catch {
    return null
  }
}

export async function writeStateFile(this: GitBackendFs, name: string, value: string): Promise<void> {
  const path = join(this.getGitdir(), name)
  await this.getFs().write(path, UniversalBuffer.from(value + '\n', 'utf8'))
}

export async function deleteStateFile(this: GitBackendFs, name: string): Promise<void> {
  const path = join(this.getGitdir(), name)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function listStateFiles(this: GitBackendFs): Promise<string[]> {
  const stateFileNames = [
    'FETCH_HEAD',
    'ORIG_HEAD',
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'BISECT_START',
    'BISECT_TERMS',
    'BISECT_EXPECTED_REV',
  ]
  const files: string[] = []
  for (const name of stateFileNames) {
    const path = join(this.getGitdir(), name)
    if (await this.getFs().exists(path)) {
      files.push(name)
    }
  }
  return files
}

export async function readSequencerFile(this: GitBackendFs, name: string): Promise<string | null> {
  const path = join(this.getGitdir(), 'sequencer', name)
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeSequencerFile(this: GitBackendFs, name: string, data: string): Promise<void> {
  const sequencerDir = join(this.getGitdir(), 'sequencer')
  if (!(await this.getFs().exists(sequencerDir))) {
    await this.getFs().mkdir(sequencerDir)
  }
  const path = join(sequencerDir, name)
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function deleteSequencerFile(this: GitBackendFs, name: string): Promise<void> {
  const path = join(this.getGitdir(), 'sequencer', name)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function listSequencerFiles(this: GitBackendFs): Promise<string[]> {
  const sequencerDir = join(this.getGitdir(), 'sequencer')
  try {
    const files = await this.getFs().readdir(sequencerDir)
    if (!files) {
      return []
    }
    return files.filter((f: string) => typeof f === 'string')
  } catch {
    return []
  }
}

export async function readInfoFile(this: GitBackendFs, name: string): Promise<string | null> {
  const path = join(this.getGitdir(), 'info', name)
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeInfoFile(this: GitBackendFs, name: string, data: string): Promise<void> {
  const infoDir = join(this.getGitdir(), 'info')
  if (!(await this.getFs().exists(infoDir))) {
    await this.getFs().mkdir(infoDir)
  }
  const path = join(infoDir, name)
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function deleteInfoFile(this: GitBackendFs, name: string): Promise<void> {
  const path = join(this.getGitdir(), 'info', name)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

