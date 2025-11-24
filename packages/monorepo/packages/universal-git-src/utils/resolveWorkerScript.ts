/**
 * Utility to resolve worker script path
 * Handles different environments (development, production, ESM, CommonJS)
 */

import { fileURLToPath } from 'url'
import path from 'path'
import * as fs from 'fs'

/**
 * Resolve the path to the git-worker script
 * Tries multiple locations to find the worker script
 * 
 * @param fromFile - The file path or import.meta.url of the calling file
 * @returns The resolved worker script path, or null if not found
 */
export function resolveWorkerScript(fromFile?: string | URL): string | null {
  try {
    // Use ESM imports instead of require for compatibility
    const pathModule = path
    const fsModule = fs
    
    // Determine base directory
    let baseDir: string
    if (fromFile) {
      if (typeof fromFile === 'string') {
        // File path
        baseDir = pathModule.dirname(fromFile)
      } else {
        // URL (import.meta.url)
        baseDir = pathModule.dirname(fileURLToPath(fromFile))
      }
    } else {
      // Try to get from import.meta.url if available
      try {
        const currentFileUrl = import.meta.url
        baseDir = pathModule.dirname(fileURLToPath(currentFileUrl))
      } catch {
        baseDir = process.cwd()
      }
    }
    
    const currentDir = process.cwd()
    
    // Try multiple possible locations
    const possiblePaths = [
      // Relative to calling file (most reliable)
      pathModule.resolve(baseDir, '../../universal-git-src/workers/git-worker.ts'),
      pathModule.resolve(baseDir, '../../universal-git-src/workers/git-worker.js'),
      // Relative to project root
      pathModule.join(currentDir, 'packages/universal-git-src/workers/git-worker.ts'),
      pathModule.join(currentDir, 'packages/universal-git-src/workers/git-worker.js'),
      // Try with file:// URL for ESM
      (() => {
        try {
          if (fromFile && typeof fromFile !== 'string') {
            const workerUrl = new URL('../../universal-git-src/workers/git-worker.ts', fromFile)
            return fileURLToPath(workerUrl)
          } else if (typeof import.meta !== 'undefined' && import.meta.url) {
            const workerUrl = new URL('../../universal-git-src/workers/git-worker.ts', import.meta.url)
            return fileURLToPath(workerUrl)
          }
          return null
        } catch {
          return null
        }
      })(),
    ].filter((p): p is string => p !== null)
    
    // Try each path
    for (const possiblePath of possiblePaths) {
      try {
        const normalizedPath = pathModule.resolve(possiblePath)
        if (fsModule.existsSync(normalizedPath)) {
          return normalizedPath
        }
      } catch {
        // Try next path
      }
    }
    
    return null
  } catch (error) {
    console.warn(`Could not resolve worker script: ${(error as Error).message}`)
    return null
  }
}

