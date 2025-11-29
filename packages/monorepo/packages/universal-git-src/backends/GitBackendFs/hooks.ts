import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Hook operations for GitBackendFs
 */

export async function readHook(this: GitBackendFs, name: string): Promise<UniversalBuffer | null> {
  const path = join(this.getGitdir(), 'hooks', name)
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writeHook(this: GitBackendFs, name: string, data: UniversalBuffer): Promise<void> {
  const hooksDir = join(this.getGitdir(), 'hooks')
  if (!(await this.getFs().exists(hooksDir))) {
    await this.getFs().mkdir(hooksDir)
  }
  const path = join(hooksDir, name)
  await this.getFs().write(path, data)
}

export async function deleteHook(this: GitBackendFs, name: string): Promise<void> {
  const path = join(this.getGitdir(), 'hooks', name)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function listHooks(this: GitBackendFs): Promise<string[]> {
  const hooksDir = join(this.getGitdir(), 'hooks')
  try {
    const files = await this.getFs().readdir(hooksDir)
    if (!files) {
      return []
    }
    return files.filter((f: string) => typeof f === 'string')
  } catch {
    return []
  }
}

export async function hasHook(this: GitBackendFs, name: string): Promise<boolean> {
  const path = join(this.getGitdir(), 'hooks', name)
  return this.getFs().exists(path)
}

export async function runHook(
  this: GitBackendFs,
  hookName: string,
  context?: import('../../git/hooks/runHook.ts').HookContext,
  executor?: import('../../git/hooks/runHook.ts').HookExecutor,
  stdin?: string | UniversalBuffer,
  args?: string[]
): Promise<import('../../git/hooks/runHook.ts').HookResult> {
  // Check if hook should run
  const shouldRun = await this.hasHook(hookName)
  if (!shouldRun) {
    // Hook doesn't exist or isn't executable - return success
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    }
  }

  // Get hook path - respect core.hooksPath config
  const { getHooksPath } = await import('../../git/hooks/shouldRunHook.ts')
  const hooksPath = await getHooksPath({ fs: this.getFs(), gitdir: this.getGitdir() })
  const hookPath = join(hooksPath, hookName)

  // Get executor
  const { getDefaultExecutor } = await import('../../git/hooks/runHook.ts')
  const hookExecutor = executor || getDefaultExecutor()

  // Build environment variables
  const env: Record<string, string> = {
    ...context?.env,
  }

  // Set Git environment variables
  if (context?.gitdir) {
    env.GIT_DIR = context.gitdir
  }
  if (context?.workTree) {
    env.GIT_WORK_TREE = context.workTree
  }
  if (context?.indexFile) {
    env.GIT_INDEX_FILE = context.indexFile
  }
  if (context?.branch) {
    env.GIT_BRANCH = context.branch
  }
  if (context?.previousHead) {
    env.GIT_PREVIOUS_HEAD = context.previousHead
  }
  if (context?.newHead) {
    env.GIT_HEAD = context.newHead
  }
  if (context?.commitOid) {
    env.GIT_COMMIT = context.commitOid
  }
  if (context?.remote) {
    env.GIT_REMOTE = context.remote
  }
  if (context?.remoteUrl) {
    env.GIT_REMOTE_URL = context.remoteUrl
  }

  // Get additional Git config values that hooks might need
  try {
    const configBuffer = await this.readConfig()
    const { parse } = await import('../../core-utils/ConfigParser.ts')
    const config = parse(configBuffer)
    const authorName = config.get('user.name') as string | undefined
    const authorEmail = config.get('user.email') as string | undefined
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
  const hookArgs: string[] = args && args.length > 0 ? args : []

  // If args weren't provided, build them from context
  if (hookArgs.length === 0 && context) {
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

