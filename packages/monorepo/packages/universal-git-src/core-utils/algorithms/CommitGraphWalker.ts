import { GitCommit } from "../../models/GitCommit.ts"
import { readObject } from '../../git/objects/readObject.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { CommitObject } from "../../models/GitCommit.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

type ReadCommitFn = (oid: string) => Promise<CommitObject>

/**
 * Performs topological sort on commits from head commits
 * Returns all reachable commits in topological order (oldest first)
 */
export const topologicalSort = async ({
  heads,
  readCommit,
}: {
  heads: string[]
  readCommit: ReadCommitFn
}): Promise<string[]> => {
  const read: ReadCommitFn = readCommit

  const visited = new Set<string>()
  const result: string[] = []
  const inDegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  // First pass: build the graph and calculate in-degrees
  const buildGraph = async (oid: string): Promise<void> => {
    if (visited.has(oid)) return
    visited.add(oid)

    const commit = await read(oid)
    const parents = commit.parent || []

    if (!inDegree.has(oid)) {
      inDegree.set(oid, 0)
    }
    if (!children.has(oid)) {
      children.set(oid, [])
    }

    for (const parent of parents) {
      if (!inDegree.has(parent)) {
        inDegree.set(parent, 0)
      }
      if (!children.has(parent)) {
        children.set(parent, [])
      }
      inDegree.set(parent, inDegree.get(parent)! + 1)
      children.get(oid)!.push(parent)
      await buildGraph(parent)
    }
  }

  // Build graph from all heads
  for (const head of heads) {
    await buildGraph(head)
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = []
  for (const [oid, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(oid)
    }
  }

  while (queue.length > 0) {
    // Sort by timestamp for consistent ordering
    queue.sort((a, b) => {
      // We'd need to read commits to compare, but for simplicity, just use OID
      return a.localeCompare(b)
    })

    const oid = queue.shift()!
    result.push(oid)

    const childOids = children.get(oid) || []
    for (const child of childOids) {
      const degree = inDegree.get(child)! - 1
      inDegree.set(child, degree)
      if (degree === 0) {
        queue.push(child)
      }
    }
  }

  return result.reverse() // Return oldest first
}

/**
 * Finds the merge base (common ancestor) of a set of commits
 * Implements the merge-base algorithm
 */
export const findMergeBase = async ({
  commits,
  readCommit,
}: {
  commits: string[]
  readCommit: ReadCommitFn
}): Promise<string[]> => {
  const read: ReadCommitFn = readCommit

  // If we start N independent walkers, one at each of the given commits, and walk backwards
  // through ancestors, eventually we'll discover a commit where each one of these N walkers
  // has passed through. So we just need to keep track of which walkers have visited each commit
  // until we find a commit that N distinct walkers has visited.
  const visits: Record<string, Set<number>> = {}
  const passes = commits.length
  let heads: Array<{ index: number; oid: string }> = commits.map((oid, index) => ({ index, oid }))

  while (heads.length > 0) {
    // Count how many times we've passed each commit
    const result = new Set<string>()
    for (const { oid, index } of heads) {
      if (!visits[oid]) visits[oid] = new Set()
      visits[oid].add(index)
      if (visits[oid].size === passes) {
        result.add(oid)
      }
    }
    if (result.size > 0) {
      return [...result]
    }

    // We haven't found a common ancestor yet
    const newheads = new Map<string, { oid: string; index: number }>()
    for (const { oid, index } of heads) {
      try {
        const commit = await read(oid)
        const parents = commit.parent || []
        for (const parentOid of parents) {
          if (!visits[parentOid] || !visits[parentOid].has(index)) {
            newheads.set(parentOid + ':' + index, { oid: parentOid, index })
          }
        }
      } catch {
        // Commit not found, skip
      }
    }
    heads = Array.from(newheads.values())
  }

  return []
}
