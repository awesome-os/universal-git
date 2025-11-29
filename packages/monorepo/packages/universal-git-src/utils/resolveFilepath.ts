// @ts-check
import { InvalidFilepathError } from '../errors/InvalidFilepathError.ts'
import { NotFoundError } from '../errors/NotFoundError.ts'
import { ObjectTypeError } from '../errors/ObjectTypeError.ts'
import { GitTree } from "../models/GitTree.ts"
import { readObject } from "../git/objects/readObject.ts"
import { resolveTree } from './resolveTree.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"

import type { GitBackend } from '../backends/GitBackend.ts'

export async function resolveFilepath({
  fs,
  cache,
  gitdir,
  gitBackend,
  oid,
  filepath,
}: {
  fs?: FileSystemProvider
  cache: Record<string, unknown>
  gitdir?: string
  gitBackend?: GitBackend
  oid: string
  filepath: string
}): Promise<string> {
  // Ensure there are no leading or trailing directory separators.
  // I was going to do this automatically, but then found that the Git Terminal for Windows
  // auto-expands --filepath=/src/utils to --filepath=C:/Users/Will/AppData/Local/Programs/Git/src/utils
  // so I figured it would be wise to promote the behavior in the application layer not just the library layer.
  if (filepath.startsWith('/')) {
    throw new InvalidFilepathError('leading-slash')
  } else if (filepath.endsWith('/')) {
    throw new InvalidFilepathError('trailing-slash')
  }
  const _oid = oid
  const result = await resolveTree({ fs, cache, gitdir, gitBackend, oid })
  let tree: GitTree = GitTree.from(result.tree)
  if (filepath === '') {
    oid = result.oid
  } else {
    const pathArray = filepath.split('/')
    oid = await _resolveFilepath({
      fs,
      cache,
      gitdir,
      gitBackend,
      tree,
      pathArray,
      oid: _oid,
      filepath,
    })
  }
  return oid
}

async function _resolveFilepath({
  fs,
  cache,
  gitdir,
  gitBackend,
  tree,
  pathArray,
  oid,
  filepath,
}: {
  fs?: FileSystemProvider
  cache: Record<string, unknown>
  gitdir?: string
  gitBackend?: GitBackend
  tree: GitTree
  pathArray: string[]
  oid: string
  filepath: string
}): Promise<string> {
  const name = pathArray.shift()
  if (!name) {
    throw new NotFoundError(`file or directory found at "${oid}:${filepath}"`)
  }
  for (const entry of tree) {
    if (entry.path === name) {
      if (pathArray.length === 0) {
        return entry.oid
      } else {
        let type: string
        let object: UniversalBuffer
        
        if (gitBackend) {
          const result = await gitBackend.readObject(entry.oid, 'content', cache)
          type = result.type
          object = result.object
        } else if (fs && gitdir) {
          const result = await readObject({
            fs,
            cache,
            gitdir,
            oid: entry.oid,
          })
          type = result.type
          object = result.object
        } else {
          throw new Error('Either gitBackend or fs+gitdir must be provided')
        }

        if (type !== 'tree') {
          throw new ObjectTypeError(oid, (type || 'unknown') as 'commit' | 'blob' | 'tree' | 'tag', 'tree', filepath)
        }
        tree = GitTree.from(object)
        return _resolveFilepath({
          fs,
          cache,
          gitdir,
          gitBackend,
          tree,
          pathArray,
          oid,
          filepath,
        })
      }
    }
  }
  throw new NotFoundError(`file or directory found at "${oid}:${filepath}"`)
}

