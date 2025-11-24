import { assertParameter } from './assertParameter.ts'
import { join } from './join.ts'
import { withErrorCaller } from './errorHandler.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Creates a standardized API wrapper function for commands
 * This reduces redundancy across all read/write API functions
 */
export function createApiWrapper<TArgs extends Record<string, unknown>, TResult>(
  commandFn: (args: TArgs & { fs: FileSystemProvider; gitdir: string }) => Promise<TResult>,
  callerName: string,
  requiredParams: string[] = ['fs', 'gitdir']
) {
  return withErrorCaller(
    async (args: TArgs & { fs?: FileSystemProvider; dir?: string; gitdir?: string; cache?: Record<string, unknown> }): Promise<TResult> => {
      // Validate required parameters
      for (const param of requiredParams) {
        assertParameter(param, (args as Record<string, unknown>)[param])
      }

      // Resolve gitdir
      const gitdir = args.gitdir || (args.dir ? join(args.dir, '.git') : undefined)
      if (!gitdir) {
        throw new Error('gitdir is required')
      }

      // Call the command function
      return await commandFn({
        ...args,
        fs: args.fs!,
        gitdir,
      } as TArgs & { fs: FileSystemProvider; gitdir: string })
    },
    callerName
  )
}

