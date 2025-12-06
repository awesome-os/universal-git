/**
 * Graph Walker
 * Efficiently walks the commit graph using generation numbers.
 * 
 * Instead of walking raw Commit Objects (which requires inflating zlib blobs),
 * we walk the binary graph for instant merge-base calculations.
 */
import type { CommitGraphHandle } from '../handles/CommitGraphHandle.ts';

export class GraphWalker {
  private graphHandle: CommitGraphHandle;

  constructor(graphHandle: CommitGraphHandle) {
    this.graphHandle = graphHandle;
  }

  /**
   * Finds the merge base of two commits using generation numbers.
   * Generation numbers enable efficient traversal without parsing full commits.
   */
  async findMergeBase(oidA: string, oidB: string): Promise<string | null> {
    // 1. Get Generation Numbers (Integer comparison is instant)
    const genA = await this.graphHandle.getGeneration(oidA);
    const genB = await this.graphHandle.getGeneration(oidB);

    if (genA === null || genB === null) {
      // Commit not in graph, fall back to full object parsing
      return null;
    }

    // 2. Walk down efficiently without parsing full commit bodies
    // Start from the commit with higher generation number
    let currentA = oidA;
    let currentB = oidB;
    let genCurrentA = genA;
    let genCurrentB = genB;

    // Walk both commits until they meet or reach generation 0
    while (genCurrentA > 0 && genCurrentB > 0) {
      if (currentA === currentB) {
        return currentA; // Found merge base
      }

      // Walk the commit with higher generation down
      if (genCurrentA > genCurrentB) {
        const parents = await this.graphHandle.getParents(currentA);
        if (parents.length === 0) {
          break; // No parents
        }
        currentA = parents[0]; // Walk first parent
        genCurrentA = (await this.graphHandle.getGeneration(currentA)) || 0;
      } else {
        const parents = await this.graphHandle.getParents(currentB);
        if (parents.length === 0) {
          break; // No parents
        }
        currentB = parents[0]; // Walk first parent
        genCurrentB = (await this.graphHandle.getGeneration(currentB)) || 0;
      }
    }

    return null; // No merge base found in graph
  }

  /**
   * Checks if commit A is an ancestor of commit B.
   */
  async isAncestor(oidA: string, oidB: string): Promise<boolean> {
    const genA = await this.graphHandle.getGeneration(oidA);
    const genB = await this.graphHandle.getGeneration(oidB);

    if (genA === null || genB === null) {
      return false;
    }

    // If A has higher generation than B, it can't be an ancestor
    if (genA > genB) {
      return false;
    }

    // Walk from B towards root, checking if we encounter A
    let current = oidB;
    let genCurrent = genB;

    while (genCurrent >= genA) {
      if (current === oidA) {
        return true;
      }

      const parents = await this.graphHandle.getParents(current);
      if (parents.length === 0) {
        break;
      }

      current = parents[0];
      genCurrent = (await this.graphHandle.getGeneration(current)) || 0;
    }

    return false;
  }

  /**
   * Gets all ancestors of a commit (up to a limit).
   */
  async getAncestors(
    oid: string,
    limit: number = 100
  ): Promise<string[]> {
    const ancestors: string[] = [];
    const visited = new Set<string>();

    const queue: string[] = [oid];
    visited.add(oid);

    while (queue.length > 0 && ancestors.length < limit) {
      const current = queue.shift()!;
      const parents = await this.graphHandle.getParents(current);

      for (const parent of parents) {
        if (!visited.has(parent)) {
          visited.add(parent);
          queue.push(parent);
          ancestors.push(parent);
        }
      }
    }

    return ancestors;
  }
}
