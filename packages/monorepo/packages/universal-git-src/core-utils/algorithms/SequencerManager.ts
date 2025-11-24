import { join } from '../GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

type RebaseCommand = {
  action: string
  oid: string
  message: string
}

/**
 * Gets the sequencer directory path
 */
export const getSequencerDir = (gitdir: string, operation: 'rebase' | 'cherry-pick' = 'rebase'): string => {
  if (operation === 'rebase') {
    return join(gitdir, 'rebase-merge')
  } else if (operation === 'cherry-pick') {
    return join(gitdir, 'sequencer')
  }
  return join(gitdir, 'sequencer')
}

/**
 * Checks if a rebase is in progress
 */
export const isRebaseInProgress = async ({ fs, gitdir }: { fs: FileSystemProvider; gitdir: string }): Promise<boolean> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  return fs.exists(join(rebaseDir, 'git-rebase-todo'))
}

/**
 * Reads the rebase todo list
 */
export const readRebaseTodo = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<RebaseCommand[]> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  const todoFile = join(rebaseDir, 'git-rebase-todo')

  try {
    const content = (await fs.read(todoFile, 'utf8')) as string | null
    if (content === null) {
      return []
    }
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'))

    return lines.map(line => {
      const trimmed = line.trim()
      const parts = trimmed.split(/\s+/)
      return {
        action: parts[0] || 'pick',
        oid: parts[1] || '',
        message: parts.slice(2).join(' ') || '',
      }
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return []
    }
    throw err
  }
}

/**
 * Writes the rebase todo list
 */
export const writeRebaseTodo = async ({
  fs,
  gitdir,
  commands,
}: {
  fs: FileSystemProvider
  gitdir: string
  commands: RebaseCommand[]
}): Promise<void> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  await fs.mkdir(rebaseDir)

  const todoFile = join(rebaseDir, 'git-rebase-todo')
  const content = commands.map(cmd => `${cmd.action} ${cmd.oid} ${cmd.message}`).join('\n') + '\n'
  await fs.write(todoFile, content, 'utf8')
}

/**
 * Reads the current rebase head
 */
export const readRebaseHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  const headFile = join(rebaseDir, 'head-name')

  try {
    const content = (await fs.read(headFile, 'utf8')) as string | null
    if (content === null) {
      return null
    }
    return content.trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Reads the rebase onto OID
 */
export const readRebaseOnto = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  const ontoFile = join(rebaseDir, 'onto')

  try {
    const content = (await fs.read(ontoFile, 'utf8')) as string | null
    if (content === null) {
      return null
    }
    return content.trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Initializes a rebase sequencer
 */
export const initRebase = async ({
  fs,
  gitdir,
  headName,
  onto,
  commands,
}: {
  fs: FileSystemProvider
  gitdir: string
  headName: string
  onto: string
  commands: RebaseCommand[]
}): Promise<void> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  await fs.mkdir(rebaseDir)

  await fs.write(join(rebaseDir, 'head-name'), headName + '\n', 'utf8')
  await fs.write(join(rebaseDir, 'onto'), onto + '\n', 'utf8')
  await writeRebaseTodo({ fs, gitdir, commands })
}

/**
 * Advances to the next rebase command
 */
export const nextRebaseCommand = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<RebaseCommand | null> => {
  const commands = await readRebaseTodo({ fs, gitdir })
  if (commands.length === 0) {
    return null
  }

  // Remove the first command
  const next = commands.shift()!
  await writeRebaseTodo({ fs, gitdir, commands })

  return next
}

/**
 * Aborts a rebase
 */
export const abortRebase = async ({ fs, gitdir }: { fs: FileSystemProvider; gitdir: string }): Promise<void> => {
  const rebaseDir = getSequencerDir(gitdir, 'rebase')
  try {
    await fs.rmdir(rebaseDir, { recursive: true })
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

/**
 * Completes a rebase
 */
export const completeRebase = async ({ fs, gitdir }: { fs: FileSystemProvider; gitdir: string }): Promise<void> => {
  // Same as abort - remove the sequencer directory
  await abortRebase({ fs, gitdir })
}
