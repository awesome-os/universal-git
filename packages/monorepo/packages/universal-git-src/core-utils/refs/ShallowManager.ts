import { join } from '../GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Manages the shallow file in a Git repository
 * The shallow file contains a list of commit OIDs that are treated as root commits
 */
export class ShallowManager {
  /**
   * Reads the shallow file and returns a set of OIDs
   */
  static async read({ fs, gitdir }: { fs: FileSystemProvider; gitdir: string }): Promise<Set<string>> {
    const filepath = join(gitdir, 'shallow')
    const oids = new Set<string>()
    
    try {
      const text = (await fs.read(filepath, { encoding: 'utf8' })) as string
      if (text && text.trim()) {
        for (const line of text.trim().split('\n')) {
          const oid = line.trim()
          if (oid && /^[0-9a-f]{40}$/i.test(oid)) {
            oids.add(oid)
          }
        }
      }
    } catch {
      // File doesn't exist or can't be read - return empty set
    }
    
    return oids
  }

  /**
   * Writes a set of OIDs to the shallow file
   * If the set is empty, the file is removed
   */
  static async write({ fs, gitdir, oids }: { fs: FileSystemProvider; gitdir: string; oids: Set<string> }): Promise<void> {
    const filepath = join(gitdir, 'shallow')
    
    if (oids.size > 0) {
      const text = Array.from(oids).join('\n') + '\n'
      await fs.write(filepath, text, { encoding: 'utf8' })
    } else {
      // Remove shallow file if empty
      try {
        await fs.rm(filepath)
      } catch {
        // File doesn't exist - that's fine
      }
    }
  }
}

