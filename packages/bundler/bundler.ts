// bundler.ts
import { Project } from 'ts-morph';
import * as path from 'path';
import {
  createDependencyGraph,
  groupChunkByDirectory,
  createVirtualBarrelFile,
} from './dependencies/createDependencyGraph.ts';
import { normalizePath, pathToFileURL, relative } from './dependencies/pathUtils.ts';
import { fileURLToPath } from 'url';

/**
 * Calculates the relative import path from an output directory to a source file
 * using the robust URL API.
 * @param outputDir The absolute, normalized path to the output directory (e.g., 'C:/project/dist').
 * @param sourceFile The absolute, normalized path to the source file (e.g., 'C:/project/tmp/commands/file.js').
 * @returns A POSIX-style relative path (e.g., '../tmp/commands/file').
 */
function getRelativeImportPath(outputDir: string, sourceFile: string): string {
  // ✨ FIX: Ensure outputDir always ends with a slash to be treated as a directory.
  const fromPath = outputDir.endsWith('/') ? outputDir : outputDir + '/';

  // Use our robust 'relative' function.
  let relativePath = relative(fromPath, sourceFile);

  // Remaining steps (stripping extension, ensuring leading './') are unchanged.
  relativePath = relativePath.replace(/\.(ts|js)$/, '');
  if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
  }
  
  return relativePath;
}


/**
 * Helper function to find all unique dependencies reachable from a set of entry points.
 * @param entryPoints An array of absolute, normalized entry point file paths.
 *  @param graph The forward dependency graph of the entire project.
 * @returns A Set containing all reachable absolute, normalized file paths.
 */
function findAllReachableFiles(
  entryPoints: string[],
  graph: Map<string, Set<string>>
): Set<string> {
  const allReachable = new Set<string>();
  const stack = [...entryPoints];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentNode = stack.pop()!;
    if (visited.has(currentNode)) {
      continue;
    }
    visited.add(currentNode);
    allReachable.add(currentNode);

    const dependencies = graph.get(currentNode) || new Set();
    for (const dep of dependencies) {
      stack.push(dep);
    }
  }
  return allReachable;
}

/**
 * The main bundling function. It analyzes a project from its entry points,
 * groups all reachable code by directory, and generates the content for
 * the bundled output files.
 *
 * @param project The ts-morph Project instance.
 * @param entryPoints An array of absolute, normalized entry point file paths.
 * @param projectRoot The absolute, normalized path to the root of the project source.
 * @returns A Map where the key is the output file name (e.g., 'index.js', 'commands.js')
 *   and the value is the generated content for that file.
 */
/**
 * The main bundling function, now using URL-based path resolution.
 * @param project The ts-morph Project instance.
 * @param entryPoints An array of absolute, normalized entry point file paths.
 * @param projectRoot The absolute, normalized path to the project source root.
 * @param outputDir The absolute, normalized path to the final output directory.
 * @returns A Map of output file names to their generated content.
 */
export function bundleByDirectory(
  project: Project,
  entryPoints: string[],
  projectRoot: string,
  outputDir: string // ✨ New parameter for the output directory
): Map<string, string> {
  const dependencyGraph = createDependencyGraph(project);
  const allReachableFiles = findAllReachableFiles(entryPoints, dependencyGraph);
  const directoryChunks = groupChunkByDirectory(allReachableFiles, projectRoot);

  const outputFiles = new Map<string, string>();

  for (const [chunkName, filesInChunk] of directoryChunks.entries()) {
    const outputFileName = `${chunkName}.js`;
    const lines = [`// Auto-generated bundle for the "${chunkName}" chunk.`];

    for (const sourceFile of filesInChunk) {
      // ✨ Use our new, robust URL-based relative path calculator.
      const relativeImportPath = getRelativeImportPath(outputDir, sourceFile);
      lines.push(`export * from '${relativeImportPath}';`);
    }
    outputFiles.set(outputFileName, lines.join('\n'));
  }

  const mainIndexContent = createVirtualBarrelFile(directoryChunks);
  outputFiles.set('index.js', mainIndexContent);

  return outputFiles;
}