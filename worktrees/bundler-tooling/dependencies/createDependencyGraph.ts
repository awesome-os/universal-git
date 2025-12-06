// createDependencyGraph.ts
import { Project, SourceFile } from 'ts-morph';
import path from 'node:path'
/**
 * Creates a dependency graph for a given ts-morph project.
 *
 * The graph is represented as a Map where each key is the absolute file path
 * of a source file, and the value is a Set containing the absolute file paths

 * of its direct project-internal dependencies.
 *
 * This function is pure and does not modify the project. It ignores all
 * modules resolved to `node_modules` or built-in Node.js modules.
 *
 * @param project The ts-morph Project instance to analyze.
 * @returns A Map representing the project's dependency graph.
 */
export function createDependencyGraph(project: Project): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Primary guard: skip any files that are already in node_modules
    if (filePath.includes('/node_modules/')) {
      continue;
    }

    const dependencies = new Set<string>();

    // Get both import and export declarations (e.g., export { a } from './b')
    const declarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ];

    for (const declaration of declarations) {
      // Resolve the module specifier to an actual source file
      const resolvedSourceFile = declaration.getModuleSpecifierSourceFile();

      // If it's undefined, it's a module we can't find (e.g., node built-in, or external library)
      if (resolvedSourceFile) {
        const dependencyPath = resolvedSourceFile.getFilePath();

        // The crucial filter: only include dependencies that are NOT in node_modules
        if (!dependencyPath.includes('/node_modules/')) {
          dependencies.add(dependencyPath);
        }
      }
    }

    graph.set(filePath, dependencies);
  }

  return graph;
}

/**
 * Inverts a dependency graph to show which files import a given file.
 *
 * This pure function takes a forward dependency graph (file -> its dependencies)
 * and creates a reverse graph (file -> its importers).
 *
 * @param graph The forward dependency graph to invert.
 * @returns A Map representing the reverse dependency graph.
 */
export function createReverseDependencyGraph(
  graph: Map<string, Set<string>>
): Map<string, Set<string>> {
  const reverseGraph = new Map<string, Set<string>>();

  // Iterate over each file (importer) and its list of dependencies
  for (const [importerPath, dependencies] of graph.entries()) {
    // For each dependency, we need to add the importer to its list of importers
    for (const dependencyPath of dependencies) {
      // Get the current list of importers for this dependency
      let importers = reverseGraph.get(dependencyPath);

      // If this is the first time we see this dependency being imported, create a new Set
      if (!importers) {
        importers = new Set<string>();
        reverseGraph.set(dependencyPath, importers);
      }

      // Add the current file to the list of importers for this dependency
      importers.add(importerPath);
    }
  }

  return reverseGraph;
}

// export function createDependencyGraph(project: Project): Map<string, Set<string>> { /* ... */ }
// export function createReverseDependencyGraph(graph: Map<string, Set<string>>): Map<string, Set<string>> { /* ... */ }


/**
 * Groups files into chunks of related modules based on their import/export relationships.
 *
 * This function treats the dependency graph as undirected. If File A imports File B,
 * they are considered part of the same chunk. This relationship is transitive.
 * The algorithm finds all "connected components" in the graph.
 *
 * @param dependencyGraph The forward dependency graph (file -> its dependencies).
 * @param reverseGraph The reverse dependency graph (file -> its importers).
 * @returns An array of string arrays, where each inner array is a chunk of
 *          inter-related absolute file paths.
 */
export function createChunks(
  dependencyGraph: Map<string, Set<string>>,
  reverseGraph: Map<string, Set<string>>
): string[][] {
  const allChunks: string[][] = [];
  const visited = new Set<string>(); // Keep track of files already assigned to a chunk

  // Iterate over every file in the project
  for (const filePath of dependencyGraph.keys()) {
    // If we've already visited this file, it's part of a chunk we've already found.
    if (visited.has(filePath)) {
      continue;
    }

    // This file is the start of a new, undiscovered chunk.
    const currentChunk: string[] = [];
    const stack: string[] = [filePath]; // Use a stack for depth-first traversal

    visited.add(filePath);

    // Traverse all connected files from this starting point
    while (stack.length > 0) {
      const currentNode = stack.pop()!;
      currentChunk.push(currentNode);

      // Find all neighbors (both dependencies and importers)
      const dependencies = dependencyGraph.get(currentNode) || new Set();
      const importers = reverseGraph.get(currentNode) || new Set();
      const neighbors = new Set([...dependencies, ...importers]);

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    allChunks.push(currentChunk);
  }

  return allChunks;
}

/**
 * Defines the structure for entry-point based code splitting.
 */
export interface EntryChunks {
  /** Map from entry point path to a Set of file paths exclusive to that entry. */
  entryChunks: Map<string, Set<string>>;
  /** A Set of file paths that are imported by more than one entry point. */
  sharedChunk: Set<string>;
  /** A Set of file paths that are not reachable from any entry point. */
  unreachableFiles: Set<string>;
}

/**
 * Analyzes the dependency graph to create chunks based on specified entry points.
 * This is the core logic for code splitting.
 *
 * @param dependencyGraph The forward dependency graph (file -> its dependencies).
 * @param entryPoints An array of absolute file paths for the entry points.
 * @returns An EntryChunks object detailing the entry-specific, shared, and unreachable modules.
 */
export function createEntryChunks(
  dependencyGraph: Map<string, Set<string>>,
  entryPoints: string[]
): EntryChunks {
  const allProjectFiles = new Set(dependencyGraph.keys());
  const moduleUsageCount = new Map<string, number>();
  const moduleOwner = new Map<string, string>();

  // 1. Traverse from each entry point to find all its dependencies
  for (const entryPoint of entryPoints) {
    const dependencies = findAllDependencies(entryPoint, dependencyGraph);
    for (const dep of dependencies) {
      const currentCount = moduleUsageCount.get(dep) || 0;
      moduleUsageCount.set(dep, currentCount + 1);
      // If it's the first time we see this module, claim ownership for this entry point
      if (currentCount === 0) {
        moduleOwner.set(dep, entryPoint);
      }
    }
  }

  // 2. Categorize all files based on their usage count
  const result: EntryChunks = {
    entryChunks: new Map(entryPoints.map(ep => [ep, new Set()])),
    sharedChunk: new Set(),
    unreachableFiles: new Set(),
  };

  for (const file of allProjectFiles) {
    const count = moduleUsageCount.get(file) || 0;

    if (count > 1) {
      result.sharedChunk.add(file);
    } else if (count === 1) {
      const owner = moduleOwner.get(file)!;
      result.entryChunks.get(owner)!.add(file);
    } else {
      result.unreachableFiles.add(file);
    }
  }

  return result;
}

/**
 * Helper function to perform a depth-first traversal of the dependency graph
 * from a starting node.
 * @param startNode The absolute path to the starting file.
 * @param graph The forward dependency graph.
 * @returns A Set of all reachable file paths, including the startNode itself.
 */
function findAllDependencies(
  startNode: string,
  graph: Map<string, Set<string>>
): Set<string> {
  const visited = new Set<string>();
  const stack: string[] = [startNode];

  while (stack.length > 0) {
    const currentNode = stack.pop()!;
    if (!visited.has(currentNode)) {
      visited.add(currentNode);
      const dependencies = graph.get(currentNode) || new Set();
      for (const dependency of dependencies) {
        stack.push(dependency);
      }
    }
  }
  return visited;
}

/**
 * Groups a flat chunk of file paths into smaller chunks based on their
 * parent directory relative to a project root.
 *
 * @param chunk A Set of absolute, normalized file paths to group.
 * @param projectRoot The absolute, normalized path to the root of the project.
 *   This is used to determine the relative directory structure.
 * @returns A Map where the key is the directory-based chunk name (e.g., 'commands',
 *   'utils', 'errors') and the value is a Set of file paths belonging to that chunk.
 */
export function groupChunkByDirectory(
  chunk: Set<string>,
  projectRoot: string
): Map<string, Set<string>> {
  const directoryChunks = new Map<string, Set<string>>();

  for (const filePath of chunk) {
    // 1. Get the path relative to our defined root.
    //    On Windows, this might return 'commands\getConfig.js'
    const relativePath = path.relative(projectRoot, filePath);

    // 2. ✨ FIX: Normalize the relative path to use forward slashes. ✨
    //    'commands\getConfig.js' becomes 'commands/getConfig.js'
    const normalizedRelativePath = relativePath.replace(/\\/g, '/');

    // 3. Now, split the correctly formatted path.
    const parts = normalizedRelativePath.split('/');

    let chunkName: string;

    // 4. This logic is now correct.
    if (parts.length === 1) {
      // A file directly in the root, like 'typedefs.js'.
      chunkName = 'index';
    } else {
      // The first directory is the chunk name.
      // e.g., ['commands', 'getConfig.js'] -> chunk 'commands'
      chunkName = parts[0];
    }

    const filesInChunk = directoryChunks.get(chunkName) || new Set<string>();
    filesInChunk.add(filePath);
    directoryChunks.set(chunkName, filesInChunk);
  }

  return directoryChunks;
}

/**
 * Generates the content for a "barrel file" that re-exports from
 * a collection of directory-based chunks.
 *
 * @param directoryChunks A Map from chunk name to the set of files (as produced by groupChunkByDirectory).
 * @returns A string containing the TypeScript code for the barrel file.
 */
export function createVirtualBarrelFile(
  directoryChunks: Map<string, Set<string>>
): string {
  const lines: string[] = [
    '// This file is auto-generated by the universal-git bundler.',
    '// It re-exports all shared modules for consumption by the entry points.',
    '',
  ];

  const chunkNames = Array.from(directoryChunks.keys()).sort();

  for (const chunkName of chunkNames) {
    // The bundler will later create 'commands.js', 'errors.js', etc.
    // We create the export statements to point to them.
    lines.push(`export * from './${chunkName}';`);
  }

  return lines.join('\n');
}