import { basename } from './basename.ts'
import { dirname } from './dirname.ts'

type Node = {
  type: string
  fullpath: string
  basename: string
  metadata: Record<string, unknown>
  parent?: Node
  children: Node[]
}

export function flatFileListToDirectoryStructure(files: Array<{ path: string; [key: string]: unknown }>): Map<string, Node> {
  const inodes = new Map<string, Node>()
  
  const mkdir = function (name: string): Node {
    if (!inodes.has(name)) {
      const dir: Node = {
        type: 'tree',
        fullpath: name,
        basename: basename(name),
        metadata: {},
        children: [],
      }
      inodes.set(name, dir)
      // This recursively generates any missing parent folders.
      // We do it after we've added the inode to the set so that
      // we don't recurse infinitely trying to create the root '.' dirname.
      dir.parent = mkdir(dirname(name))
      if (dir.parent && dir.parent !== dir) dir.parent.children.push(dir)
    }
    return inodes.get(name)!
  }

  const mkfile = function (name: string, metadata: Record<string, unknown>): Node {
    if (!inodes.has(name)) {
      const file: Node = {
        type: 'blob',
        fullpath: name,
        basename: basename(name),
        metadata,
        // This recursively generates any missing parent folders.
        parent: mkdir(dirname(name)),
        children: [],
      }
      if (file.parent) file.parent.children.push(file)
      inodes.set(name, file)
    }
    return inodes.get(name)!
  }

  mkdir('.')
  for (const file of files) {
    mkfile(file.path, file)
  }
  return inodes
}

