import { arrayRange } from "../utils/arrayRange.ts"
import { GitWalkSymbol } from "../utils/symbols.ts"
import { unionOfIterators } from "../utils/unionOfIterators.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { Walker, WalkerMap, WalkerReduce, WalkerIterate, WalkerEntry, WalkerIterateCallback } from "../models/Walker.ts"
import { WalkerReduceFlat, WalkerIterate as WalkerIterateFn } from "../models/Walker.ts"

/**
 * @param {object} args
 * @param {Repository} args.repo - Repository instance (ensures state consistency)
 * @param {Walker[]} args.trees
 * @param {WalkerMap} [args.map]
 * @param {WalkerReduce} [args.reduce]
 * @param {WalkerIterate} [args.iterate]
 *
 * @returns {Promise<any>} The finished tree-walking result
 *
 * @see {WalkerMap}
 *
 */
export async function _walk({
  repo,
  trees,
  map = async (_: string, entry: WalkerEntry[]) => entry,
  // The default reducer is a flatmap that filters out undefineds.
  reduce = WalkerReduceFlat(),
  // The default iterate function walks all children concurrently
  iterate = WalkerIterateFn(async (walk: WalkerIterateCallback, children: IterableIterator<WalkerEntry[]>) => Promise.all([...children].map(walk))),
}: {
  repo: Repository
  trees: Walker[]
  map?: WalkerMap
  reduce?: WalkerReduce
  iterate?: WalkerIterate
}): Promise<unknown> {
  const walkers = await Promise.all(
    trees.map(proxy => proxy[GitWalkSymbol]({ repo }))
  )

  const root = new Array(walkers.length).fill('.')
  const range = arrayRange(0, walkers.length)
  const unionWalkerFromReaddir = async (entries: (string | null)[]) => {
    // First, construct entries from path strings
    // entries should be an array of strings like ['.', '.', '.']
    range.forEach(i => {
      const entry = entries[i]
      // Construct entry from path string (e.g., '.')
      // entry should be a string like '.', and ConstructEntry takes a string
      if (entry && typeof entry === 'string') {
        try {
          const constructed = new (walkers[i] as any).ConstructEntry(entry)
          entries[i] = constructed
          // Verify the entry was constructed correctly
          if (!constructed || !constructed._fullpath) {
            throw new Error(`Constructed entry missing _fullpath: ${JSON.stringify(constructed)}`)
          }
        } catch (err) {
          // If ConstructEntry fails, set to null
          entries[i] = null
        }
      } else {
        entries[i] = null
      }
    })
    // Then call readdir on each entry
    const subdirs = await Promise.all(
      range.map(i => {
        const entry = entries[i]
        // If entry is null/undefined, return empty array
        if (!entry) return []
        // Call readdir on the entry - it returns Promise<string[] | null>
        return (walkers[i] as any).readdir(entry).catch((err: any) => {
          // If readdir fails (e.g., entry doesn't exist or is not a directory), return empty array
          // This allows the walk to continue even if one walker fails
          return []
        })
      })
    )
    // Now process child directories
    const iterators = subdirs.map(array => {
      return (array === null ? [] : array)[Symbol.iterator]()
    })

    return {
      entries,
      // unionOfIterators returns (string | null)[] arrays, not WalkerEntry[]
      // The walkCallback will handle converting these paths to entries
      children: unionOfIterators(iterators),
    }
  }

  const walk = async (root: (string | null)[]): Promise<unknown> => {
    const { entries, children } = await unionWalkerFromReaddir(root)
    // Find the first entry that has a _fullpath property
    // This should be '.' for the root entry
    // entries should be an array of entry objects, each with _fullpath set
    const fullpath = (entries as any[]).find((entry: any) => entry && entry._fullpath)?._fullpath
    if (!fullpath) {
      // If no fullpath found, it means no entries were constructed successfully
      return undefined
    }
    // Convert entries array to WalkerEntry[] (null values are preserved as null)
    // The map function may accept (WalkerEntry | null)[] if it's WalkerMapWithNulls
    // For compatibility, we pass entries as-is and let the map function handle nulls
    const parent = await map(fullpath, entries as any)
    // Always walk children, even if parent is null (parent being null just means it's filtered out)
    // Create a callback that matches WalkerIterateCallback signature
    const walkCallback: WalkerIterateCallback = async (childEntries: WalkerEntry[]) => {
      // childEntries from unionOfIterators are actually arrays of (string | null), not WalkerEntry objects
      // Extract the paths - preserve null values to track which trees don't have the entry
      const childPaths = childEntries.map((entry: any) => {
        if (typeof entry === 'string') {
          return entry
        }
        if (entry === null || entry === undefined) {
          return null
        }
        return entry?._fullpath || null
      }).filter((path): path is string | null => path !== undefined && path !== '.')
      // Find the first non-null path to use as the filepath for walking
      const filepath = childPaths.find(p => p !== null)
      if (!filepath) {
        // All paths are null - no children to walk
        return []
      }
      // Call walk with the array of paths (preserving null values from unionOfIterators)
      // This ensures that entries are only constructed for trees where the path exists
      // If a path is null, it means the file doesn't exist in that tree
      const result = await walk(childPaths as (string | null)[])
      // Return result directly (not wrapped in array) - the iterate function will handle arrayification
      // If result is already an array (from reduce), return it as-is
      // If result is undefined, return empty array
      if (result === undefined) return []
      // If result is an array, spread it to flatten one level
      if (Array.isArray(result)) {
        return result
      }
      // Otherwise, wrap in array
      return [result]
    }
    // children is Generator<(string | null)[]>, but iterate expects IterableIterator<WalkerEntry[]>
    // The walkCallback converts (string | null)[] to WalkerEntry[] internally, so we can safely cast
    // The iterate function's walkCallback parameter will receive (string | null)[] arrays and convert them
    let walkedChildren = await iterate(walkCallback as any, children as any)
    walkedChildren = walkedChildren.filter(x => x !== undefined)
    
    // If parent is null, just return the children (parent is filtered out)
    // The reduce function should handle undefined parent correctly
    return reduce(parent ?? undefined, walkedChildren)
  }
  return walk(root)
}

/**
 * A powerful recursive tree-walking utility.
 *
 * The `walk` API simplifies gathering detailed information about a tree or comparing all the filepaths in two or more trees.
 * Trees can be git commits, the working directory, or the or git index (staging area).
 * As long as a file or directory is present in at least one of the trees, it will be traversed.
 * Entries are traversed in alphabetical order.
 *
 * The arguments to `walk` are the `trees` you want to traverse, and 3 optional transform functions:
 *  `map`, `reduce`, and `iterate`.
 *
 * ## `TREE`, `WORKDIR`, and `STAGE`
 *
 * Tree walkers are represented by three separate functions that can be imported:
 *
 * ```js
 * import { WalkerFactory } from '@awesome-os/universal-git-src/models/Walker.ts'
 * ```
 *
 * These functions return opaque handles called `Walker`s.
 * The only thing that `Walker` objects are good for is passing into `walk`.
 * Here are the three `Walker`s passed into `walk` by the `statusMatrix` command for example:
 *
 * ```js
 * let ref = 'HEAD'
 *
 * let trees = [WalkerFactory.tree({ ref }), WalkerFactory.workdir(), WalkerFactory.stage()]
 * ```
 *
 * For the arguments, see the doc pages for [TREE](./TREE.md), [WORKDIR](./WORKDIR.md), and [STAGE](./STAGE.md).
 *
 * `map`, `reduce`, and `iterate` allow you control the recursive walk by pruning and transforming `WalkerEntry`s into the desired result.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {Walker[]} args.trees - The trees you want to traverse
 * @param {WalkerMap} [args.map] - Transform `WalkerEntry`s into a result form
 * @param {WalkerReduce} [args.reduce] - Control how mapped entries are combined with their parent result
 * @param {WalkerIterate} [args.iterate] - Fine-tune how entries within a tree are iterated over
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<any>} The finished tree-walking result
 */
export async function walk({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  trees,
  map,
  reduce,
  iterate,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  trees: Walker[]
  map?: WalkerMap
  reduce?: WalkerReduce
  iterate?: WalkerIterate
  cache?: Record<string, unknown>
}): Promise<any> {
  try {
    const normalized = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      trees,
      map,
      reduce,
      iterate,
    })

    assertParameter('trees', normalized.trees)
    
    return await _walk({
      repo: normalized.repo,
      trees: normalized.trees,
      map: normalized.map,
      reduce: normalized.reduce,
      iterate: normalized.iterate,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.walk'
    throw err
  }
}

