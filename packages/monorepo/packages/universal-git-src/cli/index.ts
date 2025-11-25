import { ArgumentParser } from './ArgumentParser.ts'
import { CommandRouter } from './CommandRouter.ts'
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { HttpClient } from "../git/remote/types.ts"

/**
 * Options for CLI
 */
export type CliOptions = {
  fs: FileSystemProvider
  http?: HttpClient
  cwd?: string
  cache?: Record<string, unknown>
}

/**
 * Main CLI entrypoint
 */
export const cli = async (args: string[], options: CliOptions = {} as CliOptions): Promise<unknown> => {
  const {
    fs,
    http,
    cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.',
    cache = {},
  } = options

  if (!fs) {
    throw new Error('File system client (fs) is required')
  }

  // Parse arguments
  const { command, flags, positional } = ArgumentParser.parse(args)

  if (!command) {
    // No command provided, show help or version
    if (flags.version || flags.v) {
      const { version } = await import('../utils/version.ts')
      return version()
    }
    // Show help
    return _showHelp()
  }

  // Special case: clone and ungit don't need an existing repo
  if (command === 'clone' || command === 'ungit') {
    const router = new CommandRouter(new Repository(fs, cwd, null, cache))
    return router.dispatch(command, flags, positional)
  }

  // Open repository
  let repo: Repository
  try {
    repo = await Repository.open({ fs, dir: cwd, cache })
  } catch (err) {
    if (command === 'init') {
      // Init doesn't need existing repo
      const router = new CommandRouter(new Repository(fs, cwd, null, cache))
      return router.dispatch(command, flags, positional)
    }
    throw new Error(`Not a git repository: ${cwd}. Use 'git init' to initialize.`)
  }

  // Create router and dispatch
  const router = new CommandRouter(repo)
  return router.dispatch(command, flags, positional)
}

/**
 * Shows help message
 * @private
 */
const _showHelp = (): string => {
  return `
Universal Git - A complete Git implementation

Usage: git <command> [flags] [args...]

Common commands:
  init              Initialize a new repository
  add <file>        Add files to the index
  commit            Record changes to the repository
  status            Show the working tree status
  log               Show commit logs
  checkout          Switch branches or restore files
  branch            List, create, or delete branches
  merge             Join two development histories
  pull              Fetch and merge from remote
  push              Update remote refs
  fetch             Download objects and refs
  clone             Clone a repository
  tag               Create, list, or delete tags
  diff              Show changes
  show              Show various types of objects
  rm                Remove files
  remote            Manage remotes
  sparse-checkout   Manage sparse checkout patterns

For more information on a specific command, use: git <command> --help
`
}
