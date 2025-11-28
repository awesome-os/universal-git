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
  gitBackend,
  worktreeBackend,
  cache,
  trees,
  map = async (_: string, entry: WalkerEntry[]) => entry,
  // The default reducer is a flatmap that filters out undefineds.
  reduce = WalkerReduceFlat(),
  // The default iterate function processes children sequentially to avoid race conditions
  // CRITICAL: Using Promise.all() causes file locking issues (EBUSY) on Windows when
  // operations like abortMerge modify files while walking. Sequential processing is safer.
  // NOTE: We push the entire result (not spread) because reduce expects an array of child results
  iterate = WalkerIterateFn(async (walk: WalkerIterateCallback, children: IterableIterator<WalkerEntry[]>) => {
    const DEBUG = process.env.DEBUG_WALK === 'true'
    const log = DEBUG ? console.log.bind(console, '[walk:iterate]') : () => {}
    const results: unknown[] = []
    let childIndex = 0
    log('Starting iteration over children')
    try {
      for (const child of children) {
        childIndex++
        const childPaths = child.map(c => c?._fullpath || c?.path || String(c) || 'null')
        log(`  [${childIndex}] Processing child: ${JSON.stringify(childPaths)}`)
        try {
          log(`    [${childIndex}] Calling walk()...`)
          const startTime = Date.now()
          const result = await walk(child)
          const elapsed = Date.now() - startTime
          log(`    [${childIndex}] walk() completed in ${elapsed}ms, result type: ${typeof result}, isArray: ${Array.isArray(result)}`)
          // Push the entire result as a single element - reduce will handle flattening if needed
          if (result !== undefined) {
            results.push(result)
            log(`    [${childIndex}] Added result to array, total results: ${results.length}`)
          } else {
            log(`    [${childIndex}] Result is undefined, skipping`)
          }
        } catch (err) {
          log(`    [${childIndex}] ERROR in walk(): ${(err as Error).message}`)
          log(`    [${childIndex}] Stack: ${(err as Error).stack}`)
          throw err
        }
      }
      log(`Iteration complete, returning ${results.length} results`)
    } catch (err) {
      log(`FATAL ERROR in iteration: ${(err as Error).message}`)
      log(`Stack: ${(err as Error).stack}`)
      throw err
    }
    return results
  }),
}: {
  gitBackend: import('../backends/GitBackend.ts').GitBackend
  worktreeBackend?: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  cache?: Record<string, unknown>
  trees: Walker[]
  map?: WalkerMap
  reduce?: WalkerReduce
  iterate?: WalkerIterate
}): Promise<unknown> {
  const DEBUG = process.env.DEBUG_WALK === 'true'
  const log = DEBUG ? console.log.bind(console, '[_walk]') : () => {}
  
  log('Creating walkers...', { treesCount: trees.length })
  const walkers = await Promise.all(
    trees.map((proxy, i) => {
      log(`  Creating walker ${i}...`)
      return proxy[GitWalkSymbol]({ 
        gitBackend,
        worktreeBackend,
        cache: cache || {},
      })
    })
  )
  log('Walkers created', { walkersCount: walkers.length })

  const root = new Array(walkers.length).fill('.')
  const range = arrayRange(0, walkers.length)
  const unionWalkerFromReaddir = async (entries: (string | null)[]) => {
    log(`unionWalkerFromReaddir called with entries: ${JSON.stringify(entries)}`)
    // First, construct entries from path strings
    // entries should be an array of strings like ['.', '.', '.']
    range.forEach(i => {
      const entry = entries[i]
      log(`  Constructing entry ${i} from: ${entry}`)
      // Construct entry from path string (e.g., '.')
      // entry should be a string like '.', and ConstructEntry takes a string
      if (entry && typeof entry === 'string') {
        try {
          log(`    Calling ConstructEntry for walker ${i}...`)
          const constructed = new (walkers[i] as any).ConstructEntry(entry)
          entries[i] = constructed
          log(`    Constructed entry ${i}: ${constructed?._fullpath || 'no _fullpath'}`)
          // Verify the entry was constructed correctly
          if (!constructed || !constructed._fullpath) {
            throw new Error(`Constructed entry missing _fullpath: ${JSON.stringify(constructed)}`)
          }
        } catch (err) {
          // If ConstructEntry fails, set to null
          log(`    ConstructEntry failed for walker ${i}: ${(err as Error).message}`)
          entries[i] = null
        }
      } else {
        log(`    Entry ${i} is not a string, setting to null`)
        entries[i] = null
      }
    })
    // Then call readdir on each entry
    log(`  Calling readdir on ${range.length} entries...`)
    const subdirs = await Promise.all(
      range.map(async (i) => {
        const entry = entries[i]
        // If entry is null/undefined, return empty array
        if (!entry) {
          log(`    Walker ${i}: entry is null, returning empty array`)
          return []
        }
        // Call readdir on the entry - it returns Promise<string[] | null>
        log(`    Walker ${i}: calling readdir on ${entry._fullpath || entry.path || entry}...`)
        try {
          const startTime = Date.now()
          const result = await (walkers[i] as any).readdir(entry)
          const elapsed = Date.now() - startTime
          log(`    Walker ${i}: readdir completed in ${elapsed}ms, returned ${result?.length || 0} entries`)
          return result || []
        } catch (err) {
          // If readdir fails (e.g., entry doesn't exist or is not a directory), return empty array
          // This allows the walk to continue even if one walker fails
          log(`    Walker ${i}: readdir failed: ${(err as Error).message}, returning empty array`)
          return []
        }
      })
    )
    log(`  readdir results: ${subdirs.map((arr, i) => `walker ${i}: ${arr.length} entries`).join(', ')}`)
    // Now process child directories
    const iterators = subdirs.map(array => {
      return (array === null ? [] : array)[Symbol.iterator]()
    })

    log(`  Returning ${iterators.length} iterators`)
    return {
      entries,
      // unionOfIterators returns (string | null)[] arrays, not WalkerEntry[]
      // The walkCallback will handle converting these paths to entries
      children: unionOfIterators(iterators),
    }
  }

  let walkDepth = 0
  const walk = async (root: (string | null)[]): Promise<unknown> => {
    walkDepth++
    const currentDepth = walkDepth
    log(`walk() called at depth ${currentDepth}`, { root })
    
    if (walkDepth > 100) {
      log(`WARNING: walk depth exceeded 100, possible infinite loop at depth ${currentDepth}`)
    }
    
    const { entries, children } = await unionWalkerFromReaddir(root)
    // Find the first entry that has a _fullpath property
    // This should be '.' for the root entry
    // entries should be an array of entry objects, each with _fullpath set
    const fullpath = (entries as any[]).find((entry: any) => entry && entry._fullpath)?._fullpath
    if (!fullpath) {
      // If no fullpath found, it means no entries were constructed successfully
      log(`  No fullpath found at depth ${currentDepth}, returning undefined`)
      walkDepth--
      return undefined
    }
    log(`  Processing path: ${fullpath} at depth ${currentDepth}`)
    
    // Convert entries array to WalkerEntry[] (null values are preserved as null)
    // The map function may accept (WalkerEntry | null)[] if it's WalkerMapWithNulls
    // For compatibility, we pass entries as-is and let the map function handle nulls
    const parent = await map(fullpath, entries as any)
    log(`  Map result for ${fullpath}:`, { parentType: typeof parent, isArray: Array.isArray(parent) })
    
    // Always walk children, even if parent is null (parent being null just means it's filtered out)
    // Create a callback that matches WalkerIterateCallback signature
    const walkCallback: WalkerIterateCallback = async (childEntries: WalkerEntry[]) => {
      log(`    walkCallback called for ${fullpath} at depth ${currentDepth}`, { childrenCount: childEntries.length })
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
      log(`      walkCallback result for ${filepath}:`, { resultType: typeof result, isArray: Array.isArray(result) })
      
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
    log(`  Iterating children for ${fullpath} at depth ${currentDepth}`)
    let walkedChildren = await iterate(walkCallback as any, children as any)
    walkedChildren = walkedChildren.filter(x => x !== undefined)
    log(`  Iteration complete for ${fullpath}, children count: ${walkedChildren.length}`)
    
    // If parent is null, just return the children (parent is filtered out)
    // The reduce function should handle undefined parent correctly
    const reduced = reduce(parent ?? undefined, walkedChildren)
    log(`  Reduce complete for ${fullpath} at depth ${currentDepth}`)
    walkDepth--
    return reduced
  }
  log('Starting root walk')
  const result = await walk(root)
  log('Root walk completed')
  return result
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
  const DEBUG = process.env.DEBUG_WALK === 'true'
  const log = DEBUG ? console.log.bind(console, '[walk]') : () => {}
  
  try {
    log('Starting walk')
    log('normalizeCommandArgs...')
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
    log('normalizeCommandArgs done', { 
      repoExists: !!normalized.repo,
      treesCount: normalized.trees.length,
      gitdir: normalized.gitdir,
      dir: normalized.dir,
    })

    assertParameter('trees', normalized.trees)
    
    log('Calling _walk...')
    if (!normalized.repo?.gitBackend) {
      throw new Error('gitBackend is required for walk')
    }
    const result = await _walk({
      gitBackend: normalized.repo.gitBackend,
      worktreeBackend: normalized.repo.worktreeBackend || undefined,
      cache: normalized.repo.cache,
      trees: normalized.trees,
      map: normalized.map,
      reduce: normalized.reduce,
      iterate: normalized.iterate,
    })
    log('_walk completed')
    return result
  } catch (err) {
    log('walk error:', err)
    ;(err as { caller?: string }).caller = 'git.walk'
    throw err
  }
}

