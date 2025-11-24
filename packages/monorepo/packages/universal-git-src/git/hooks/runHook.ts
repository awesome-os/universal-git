import { getHooksPath, shouldRunHook } from './shouldRunHook.ts'
import { join } from '../../utils/join.ts'
import { getConfig } from '../config.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Hook execution context - information passed to hooks via environment variables
 */
export interface HookContext {
  /** Git directory path */
  gitdir?: string
  /** Working tree directory path */
  workTree?: string
  /** Index file path */
  indexFile?: string
  /** Current branch name */
  branch?: string
  /** Previous HEAD OID (for post-checkout, post-merge) */
  previousHead?: string
  /** New HEAD OID (for post-checkout, post-merge) */
  newHead?: string
  /** Commit OID (for commit hooks) */
  commitOid?: string
  /** Commit message (for commit-msg hook) */
  commitMessage?: string
  /** Remote name (for push hooks) */
  remote?: string
  /** Remote URL (for push hooks) */
  remoteUrl?: string
  /** Refs being pushed (for pre-push hook) */
  pushedRefs?: Array<{ ref: string; oldOid: string; newOid: string }>
  /** Additional environment variables */
  env?: Record<string, string>
}

/**
 * Hook execution result
 */
export interface HookResult {
  /** Exit code (0 = success, non-zero = failure) */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
}

/**
 * Hook executor interface - allows pluggable execution engines
 */
export interface HookExecutor {
  /**
   * Execute a hook script
   * 
   * @param hookPath - Path to the hook script
   * @param args - Command-line arguments to pass to the hook
   * @param env - Environment variables
   * @param stdin - Standard input data
   * @returns Promise resolving to hook execution result
   */
  execute(
    hookPath: string,
    args: string[],
    env: Record<string, string>,
    stdin?: string | UniversalBuffer
  ): Promise<HookResult>
}

/**
 * Default hook executor for Node.js environments
 * Uses child_process.spawn to execute hooks
 */
class NodeHookExecutor implements HookExecutor {
  async execute(
    hookPath: string,
    args: string[],
    env: Record<string, string>,
    stdin?: string | UniversalBuffer
  ): Promise<HookResult> {
    // Dynamic import to avoid issues in browser environments
    const { spawn } = await import('child_process')
    const { promisify } = await import('util')
    const { readFile } = await import('fs/promises')

    return new Promise((resolve, reject) => {
          // Read the hook file to determine how to execute it
          readFile(hookPath, 'utf8')
            .then((content) => {
              // Check if it's a shell script (starts with shebang)
              const isShellScript = content.startsWith('#!')
              
              // Determine the command to run
              let command: string
              let execArgs: string[] = []
              
              if (isShellScript) {
                // Extract the interpreter from the shebang
                const shebangMatch = content.match(/^#!\s*(.+)/)
                if (shebangMatch) {
                  const interpreter = shebangMatch[1].trim().split(/\s+/)
                  command = interpreter[0]
                  execArgs = interpreter.slice(1)
                } else {
                  // Default to sh
                  command = 'sh'
                }
                execArgs.push(hookPath, ...args)
              } else if (hookPath.endsWith('.js') || content.includes('require(') || content.includes('process.exit')) {
                // Detect Node.js scripts and execute with node
                command = process.execPath // Use node executable
                execArgs = [hookPath, ...args]
              } else {
                // Try to execute directly (for binary executables)
                command = hookPath
                execArgs = args
              }

          // Spawn the process
          const child = spawn(command, execArgs, {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
          })

          let stdout = ''
          let stderr = ''

          child.stdout?.on('data', (data: UniversalBuffer) => {
            stdout += data.toString()
          })

          child.stderr?.on('data', (data: UniversalBuffer) => {
            stderr += data.toString()
          })

          // Write stdin if provided
          if (stdin && child.stdin) {
            if (typeof stdin === 'string') {
              child.stdin.write(stdin)
            } else {
              child.stdin.write(stdin)
            }
            child.stdin.end()
          }

          child.on('close', (code) => {
            resolve({
              exitCode: code ?? 1,
              stdout,
              stderr,
            })
          })

          child.on('error', (err) => {
            reject(err)
          })
        })
        .catch((err) => {
          // If we can't read the file, try executing it directly
          const child = spawn(hookPath, args, {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
          })

          let stdout = ''
          let stderr = ''

          child.stdout?.on('data', (data: UniversalBuffer) => {
            stdout += data.toString()
          })

          child.stderr?.on('data', (data: UniversalBuffer) => {
            stderr += data.toString()
          })

          if (stdin && child.stdin) {
            if (typeof stdin === 'string') {
              child.stdin.write(stdin)
            } else {
              child.stdin.write(stdin)
            }
            child.stdin.end()
          }

          child.on('close', (code) => {
            resolve({
              exitCode: code ?? 1,
              stdout,
              stderr,
            })
          })

          child.on('error', (err) => {
            reject(err)
          })
        })
    })
  }
}

/**
 * No-op hook executor for environments that don't support process execution
 * (e.g., browsers)
 */
class NoOpHookExecutor implements HookExecutor {
  async execute(): Promise<HookResult> {
    // In browser environments, hooks cannot be executed
    // Return success to avoid breaking workflows
    return {
      exitCode: 0,
      stdout: '',
      stderr: 'Hook execution not supported in this environment',
    }
  }
}

/**
 * Gets the default hook executor for the current environment
 */
function getDefaultExecutor(): HookExecutor {
  // Check if we're in a Node.js environment with child_process support
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      return new NodeHookExecutor()
    }
  } catch {
    // Not in Node.js
  }

  // Fall back to no-op executor
  return new NoOpHookExecutor()
}

/**
 * Runs a Git hook
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param hookName - Name of the hook (e.g., 'pre-commit', 'post-commit')
 * @param context - Hook execution context (environment variables, etc.)
 * @param executor - Optional custom hook executor (defaults to environment-appropriate executor)
 * @returns Promise resolving to hook execution result
 * @throws Error if hook exists and returns non-zero exit code
 */
export async function runHook({
  fs,
  gitdir,
  hookName,
  context = {},
  executor,
  stdin,
  args = [],
}: {
  fs: FileSystemProvider
  gitdir: string
  hookName: string
  context?: HookContext
  executor?: HookExecutor
  stdin?: string | UniversalBuffer
  args?: string[]
}): Promise<HookResult> {
  // Check if hook should run
  const shouldRun = await shouldRunHook({ fs, gitdir, hookName })
  if (!shouldRun) {
    // Hook doesn't exist or isn't executable - return success
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    }
  }

  // Get hook path
  const hooksPath = await getHooksPath({ fs, gitdir })
  const hookPath = join(hooksPath, hookName)

  // Get executor
  const hookExecutor = executor || getDefaultExecutor()

  // Build environment variables
  const env: Record<string, string> = {
    ...context.env,
  }

  // Set Git environment variables
  if (context.gitdir) {
    env.GIT_DIR = context.gitdir
  }
  if (context.workTree) {
    env.GIT_WORK_TREE = context.workTree
  }
  if (context.indexFile) {
    env.GIT_INDEX_FILE = context.indexFile
  }
  if (context.branch) {
    env.GIT_BRANCH = context.branch
  }
  if (context.previousHead) {
    env.GIT_PREVIOUS_HEAD = context.previousHead
  }
  if (context.newHead) {
    env.GIT_HEAD = context.newHead
  }
  if (context.commitOid) {
    env.GIT_COMMIT = context.commitOid
  }
  if (context.remote) {
    env.GIT_REMOTE = context.remote
  }
  if (context.remoteUrl) {
    env.GIT_REMOTE_URL = context.remoteUrl
  }

  // Get additional Git config values that hooks might need
  try {
    const authorName = (await getConfig({ fs, gitdir, path: 'user.name' })) as string | undefined
    const authorEmail = (await getConfig({ fs, gitdir, path: 'user.email' })) as string | undefined
    if (authorName) {
      env.GIT_AUTHOR_NAME = authorName
    }
    if (authorEmail) {
      env.GIT_AUTHOR_EMAIL = authorEmail
    }
  } catch {
    // Config not available, that's okay
  }

  // Build command-line arguments (use provided args or build from context)
  const hookArgs: string[] = args.length > 0 ? args : []

  // If args weren't provided, build them from context
  if (hookArgs.length === 0) {
    // Some hooks receive arguments
    if (hookName === 'post-checkout' && context.previousHead && context.newHead) {
      hookArgs.push(context.previousHead, context.newHead, context.branch ? '1' : '0')
    } else if (hookName === 'post-merge' && context.newHead) {
      hookArgs.push(context.newHead ? '1' : '0')
    } else if (hookName === 'pre-push' && context.remote && context.pushedRefs) {
      // Pre-push hook receives: <remote_name> <remote_url>
      hookArgs.push(context.remote, context.remoteUrl || '')
    } else if (hookName === 'prepare-commit-msg' && context.commitMessage) {
      // Prepare-commit-msg receives: <file> <source> [<sha1>]
      // We'll pass the commit message file path
      hookArgs.push(context.commitMessage, 'message')
    } else if (hookName === 'commit-msg' && context.commitMessage) {
      // Commit-msg receives: <file>
      hookArgs.push(context.commitMessage)
    }
  }

  // Execute the hook
  const result = await hookExecutor.execute(hookPath, hookArgs, env, stdin)

  // If hook failed (non-zero exit code), throw an error
  if (result.exitCode !== 0) {
    const error = new Error(`Hook '${hookName}' failed with exit code ${result.exitCode}`)
    ;(error as any).exitCode = result.exitCode
    ;(error as any).stdout = result.stdout
    ;(error as any).stderr = result.stderr
    throw error
  }

  return result
}

