import type { FileAnalysisResult, ModuleImport, ModuleExport } from './symbolAnalyzer.ts';
import { relative, dirname } from './pathUtils.ts';

/**
 * Helper function to format a raw relative path for an import/export statement.
 * It removes the file extension and ensures it starts with './'.
 */
function formatRelativePath(rawRelativePath: string): string {
  let path = rawRelativePath.replace(/\.(ts|js)$/, '');
  if (!path.startsWith('.')) {
    path = './' + path;
  }
  return path;
}

/**
 * Generates the `import` statements for a single file's analysis.
 */
function generateImportStatements(
  imports: ModuleImport[],
  currentFilePath: string
): string[] {
  const lines: string[] = [];
  const currentDir = dirname(currentFilePath);

  for (const imp of imports) {
    const relativePath = formatRelativePath(relative(currentDir, imp.from));

    if (imp.isSideEffectOnly) {
      lines.push(`import '${relativePath}';`);
      continue;
    }

    const clauseParts: string[] = [];
    if (imp.default) {
      clauseParts.push(imp.default);
    }
    if (imp.namespace) {
      clauseParts.push(`* as ${imp.namespace}`);
    }
    if (imp.named.length > 0) {
      clauseParts.push(`{ ${imp.named.join(', ')} }`);
    }

    if (clauseParts.length > 0) {
      lines.push(`import ${clauseParts.join(', ')} from '${relativePath}';`);
    }
  }
  return lines;
}

/**
 * Recursively resolves all named exports for a given file path, now correctly
 * tracing re-exported imports to their original source.
 */
function resolveAllNamedExports(
  filePath: string,
  analysis: Map<string, FileAnalysisResult>,
  visited: Set<string> = new Set()
): Map<string, { originalFrom: string }> {
  if (visited.has(filePath)) return new Map();
  visited.add(filePath);

  const resolvedExports = new Map<string, { originalFrom: string }>();
  const fileAnalysis = analysis.get(filePath);
  if (!fileAnalysis) return resolvedExports;

  // ✨ --- NEW LOGIC: Create a lookup map for all imported symbols in this file --- ✨
  const importSourceMap = new Map<string, string>();
  for (const imp of fileAnalysis.imports) {
    if (imp.namespace) {
      // `import * as Errors from './errors'` maps 'Errors' -> './errors' path
      importSourceMap.set(imp.namespace, imp.from);
    }
    // You could also add `imp.default` and `imp.named` here if needed.
    for (const named of imp.named) {
      importSourceMap.set(named, imp.from);
    }
  }

  for (const exp of fileAnalysis.exports) {
    if (exp.from) {
      // This is a standard re-export (`export ... from ...`), logic is unchanged.
      if (exp.isStarExport) {
        const nestedExports = resolveAllNamedExports(exp.from, analysis, visited);
        for (const [name, info] of nestedExports.entries()) {
          resolvedExports.set(name, info);
        }
      } else {
        for (const name of exp.named) {
          resolvedExports.set(name, { originalFrom: exp.from });
        }
      }
    } else {
      // This is a local export (`export { Errors }`).
      for (const name of exp.named) {
         // ✨ --- THE FIX --- ✨
        // If we have already found a more specific origin for this symbol
        // from an `export *` statement, do not overwrite it.
        if (resolvedExports.has(name)) {
          continue;
        }
        // Is this exported name actually an alias for an import?
        if (importSourceMap.has(name)) {
          // YES. The original source is the import's path.
          const originalFrom = importSourceMap.get(name)!;
          resolvedExports.set(name, { originalFrom });
        } else {
          // NO. This symbol is truly defined in this file.
          resolvedExports.set(name, { originalFrom: filePath });
        }
      }
    }
  }

  return resolvedExports;
}

/**
 * Generates the `export` statements, now with a cleaner check for local symbols.
 */
function generateExportStatements(
  currentFilePath: string,
  analysis: Map<string, FileAnalysisResult>
): string[] {
  const finalExports = resolveAllNamedExports(currentFilePath, analysis);
  if (finalExports.size === 0) return [];

  const lines = ['export {'];
  const currentDir = dirname(currentFilePath);
  const sortedSymbols = Array.from(finalExports.keys()).sort();

  for (const symbolName of sortedSymbols) {
    const info = finalExports.get(symbolName)!;
    
    // ✨ --- NEW, CLEANER COMMENT LOGIC --- ✨
    // Only add a "from" comment if the symbol originates from a DIFFERENT file.
    if (info.originalFrom !== currentFilePath) {
      const relativeFrom = relative(currentDir, info.originalFrom);
      const formattedPath = formatRelativePath(relativeFrom);
      lines.push(`  // from ${formattedPath}`);
    }

    lines.push(`  ${symbolName},`);
  }

  lines.push('};');
  return lines;
}

/**
 * Constructs a map of "interface files" from a project symbol analysis.
 * (This function's implementation does not need to change).
 */
export function generateInterfaceFiles(
  analysis: Map<string, FileAnalysisResult>
): Map<string, string> {
  const interfaceFiles = new Map<string, string>();
  for (const [filePath, fileAnalysis] of analysis.entries()) {
    const importLines = generateImportStatements(fileAnalysis.imports, filePath);
    const exportLines = generateExportStatements(filePath, analysis);
    let fileContent = '';
    if (importLines.length > 0) fileContent += importLines.join('\n') + '\n';
    if (importLines.length > 0 && exportLines.length > 0) fileContent += '\n';
    if (exportLines.length > 0) fileContent += exportLines.join('\n') + '\n';
    interfaceFiles.set(filePath, fileContent);
  }
  return interfaceFiles;
}