// symbolAnalyzer.ts
import { Project, SourceFile } from 'ts-morph';
import { normalizePath } from './pathUtils.ts';

// --- Data Structures ---

/** Describes a single named import, e.g., { log } from './utils'. */
export interface ModuleImport {
  /** Absolute, normalized path of the module being imported from. */
  from: string;
  /** The list of named symbols being imported. e.g., ['log', 'error']. */
  named: string[];
  /** The alias for a namespace import. e.g., 'utils' for `import * as utils from ...`. */
  namespace?: string;
  /** The alias for a default import. e.g., 'logger' for `import logger from ...`. */
  default?: string;
  /** True if the import is only for side-effects, e.g., `import './style.css'`. */
  isSideEffectOnly: boolean;
}

/** Describes a single export statement from a module. */
export interface ModuleExport {
  /** The list of named symbols being exported. */
  named: string[];
  /** True if this is a star export, e.g., `export * from './other'`. */
  isStarExport: boolean;
  /** If this is a re-export, the absolute path of the original module. */
  from?: string;
}

/** The complete analysis result for a single source file. */
export interface FileAnalysisResult {
  imports: ModuleImport[];
  exports: ModuleExport[];
}

/**
 * Analyzes the entire project to create a detailed map of imports and exports
 * for each source file, including the specific symbols involved.
 *
 * @param project The ts-morph Project instance to analyze.
 * @returns A Map where the key is the absolute, normalized file path and the
 *   value is the detailed analysis of its imports and exports.
 */
export function analyzeProjectSymbols(project: Project): Map<string, FileAnalysisResult> {
  const analysisMap = new Map<string, FileAnalysisResult>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalizePath(sourceFile.getFilePath());

    // As always, ignore files from node_modules.
    if (filePath.includes('/node_modules/')) {
      continue;
    }

    const imports = analyzeImports(sourceFile);
    const exports = analyzeExports(sourceFile);

    analysisMap.set(filePath, { imports, exports });
  }

  return analysisMap;
}

// --- Helper Functions ---

function analyzeImports(sourceFile: SourceFile): ModuleImport[] {
  // Use a map to aggregate imports from the same module.
  // e.g., `import df from './a'` and `import {b} from './a'` become one entry.
  const aggregatedImports = new Map<string, ModuleImport>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const sourceFileFrom = importDecl.getModuleSpecifierSourceFile();
    if (!sourceFileFrom) continue; // Skip if it's an external module we can't find.

    const fromPath = normalizePath(sourceFileFrom.getFilePath());
    if (fromPath.includes('/node_modules/')) continue;

    // Get or create the entry for this module path.
    let moduleImport = aggregatedImports.get(fromPath);
    if (!moduleImport) {
      moduleImport = { from: fromPath, named: [], isSideEffectOnly: false };
      aggregatedImports.set(fromPath, moduleImport);
    }

    // Check for different import types
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      moduleImport.default = defaultImport.getText();
    }

    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      moduleImport.namespace = namespaceImport.getText();
    }

    for (const namedImport of importDecl.getNamedImports()) {
      // `getName()` gives the original name, `getAliasNode()` would give the 'as' name.
      moduleImport.named.push(namedImport.getName());
    }
    
    // An import is for side-effects if it has no import clause.
    if (!importDecl.getImportClause()) {
        moduleImport.isSideEffectOnly = true;
    }
  }

  return Array.from(aggregatedImports.values());
}

function analyzeExports(sourceFile: SourceFile): ModuleExport[] {
  const exports: ModuleExport[] = [];
  const localExportedSymbols = new Set<string>();

  // 1. Handle re-exports (`export ... from ...`) and local named exports (`export { ... }`)
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const sourceFileFrom = exportDecl.getModuleSpecifierSourceFile();
    
    if (sourceFileFrom) {
      // This is a re-export from another module.
      const fromPath = normalizePath(sourceFileFrom.getFilePath());
      if (fromPath.includes('/node_modules/')) continue;

      if (exportDecl.isNamespaceExport()) {
        // Case: `export * from './other'`
        exports.push({ from: fromPath, named: [], isStarExport: true });
      } else {
        // Case: `export { a, b } from './other'`
        const named = exportDecl.getNamedExports().map(ne => ne.getName());
        exports.push({ from: fromPath, named, isStarExport: false });
      }
    } else {
      // This is a local named export: `export { a, b }`
      for (const namedExport of exportDecl.getNamedExports()) {
        localExportedSymbols.add(namedExport.getName());
      }
    }
  }

  // 2. Handle declaration exports (`export const a = ...`, `export function b() {}`)
  // `getExportedDeclarations()` is a powerful method that finds all declarations
  // marked with the `export` keyword.
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    // We only care about the name. We also ignore 'default' as per the request.
    if (name !== 'default') {
      localExportedSymbols.add(name);
    }
  }

  // 3. Aggregate all local exports into a single ModuleExport object.
  if (localExportedSymbols.size > 0) {
    exports.push({
      named: Array.from(localExportedSymbols).sort(),
      isStarExport: false,
    });
  }

  return exports;
}