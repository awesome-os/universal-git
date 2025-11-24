import AsyncLock from 'async-lock'

import { join } from "../utils/join.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"

let lock: AsyncLock | null = null

/**
 * Reads the shallow file and returns a set of OIDs
 * The shallow file contains a list of commit OIDs that are treated as root commits
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @returns Promise resolving to a set of shallow OIDs
 */
export async function readShallow({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<Set<string>> {
  if (lock === null) lock = new AsyncLock()
  const normalizedFs = createFileSystem(fs)
  const filepath = join(gitdir, 'shallow')
  const oids = new Set<string>()
  await lock.acquire(filepath, async function () {
    const text = await normalizedFs.read(filepath, { encoding: 'utf8' })
    if (text === null) return oids // no file
    if (typeof text === 'string' && text.trim() === '') return oids // empty file
    if (typeof text === 'string') {
      text
        .trim()
        .split('\n')
        .forEach(oid => oids.add(oid))
    }
  })
  return oids
}

/**
 * Writes a set of OIDs to the shallow file
 * If the set is empty, the shallow file is removed
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param oids - Set of shallow OIDs to write
 */
export async function writeShallow({
  fs,
  gitdir,
  oids,
}: {
  fs: FileSystemProvider
  gitdir: string
  oids: Set<string>
}): Promise<void> {
  if (lock === null) lock = new AsyncLock()
  const normalizedFs = createFileSystem(fs)
  const filepath = join(gitdir, 'shallow')
  if (oids.size > 0) {
    const text = [...oids].join('\n') + '\n'
    await lock.acquire(filepath, async function () {
      await normalizedFs.write(filepath, text, {
        encoding: 'utf8',
      })
    })
  } else {
    // No shallows
    await lock.acquire(filepath, async function () {
      await normalizedFs.rm(filepath)
    })
  }
}

