#!/usr/bin/env node

/**
 * Analyze unused code and unreachable paths in the codebase
 * Uses ts-morph to analyze TypeScript code with type checking
 */

import { Project } from 'ts-morph'
import { join, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Initialize ts-morph project with type checking
const project = new Project({
  tsConfigFilePath: join(projectRoot, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: false,
})

// Get all source files
const sourceFiles = project.getSourceFiles().filter((sf) => {
  const path = sf.getFilePath()
  return path.includes('src/') && !path.includes('node_modules')
})

console.log(`📊 Analyzing ${sourceFiles.length} source files...\n`)

// Track exports and their usage
const exportsMap = new Map() // file -> Map<symbolName, exportInfo>
const fileUsage = new Map() // file -> Set<files that import it>
const unreachableCode = []

// Phase 1: Collect all exports
console.log('🔍 Phase 1: Collecting exports...')

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath()
  const relativePath = relative(projectRoot, filePath)
  
  const fileExports = new Map()
  
  // Get all exports
  const exportedDeclarations = sourceFile.getExportedDeclarations()
  for (const [name, declarations] of exportedDeclarations) {
    for (const declaration of declarations) {
      fileExports.set(name, {
        name,
        declaration,
        kind: declaration.getKindName(),
        line: declaration.getStartLineNumber(),
      })
    }
  }
  
  // Check for default export
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol()
  if (defaultExportSymbol) {
    const declaration = defaultExportSymbol.getValueDeclaration()
    if (declaration) {
      fileExports.set('default', {
        name: 'default',
        declaration,
        kind: 'default',
        line: declaration.getStartLineNumber(),
      })
    }
  }
  
  exportsMap.set(relativePath, fileExports)
  fileUsage.set(relativePath, new Set())
}

// Phase 2: Track file imports
console.log('🔍 Phase 2: Tracking imports...')

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath()
  const relativePath = relative(projectRoot, filePath)
  
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
    
    // Only track relative imports
    if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
      const importedFile = resolveImportPath(filePath, moduleSpecifier)
      if (importedFile) {
        const relativeImportedPath = relative(projectRoot, importedFile)
        if (relativeImportedPath.startsWith('src/')) {
          const usage = fileUsage.get(relativeImportedPath)
          if (usage) {
            usage.add(relativePath)
          }
        }
      }
    }
  }
}

// Phase 3: Check if exports are used using TypeScript references
console.log('🔍 Phase 3: Checking export usage with TypeScript references...\n')

const unusedExports = []
const typeChecker = project.getTypeChecker()

for (const [file, exports] of exportsMap) {
  // Skip index files - they're entry points
  if (file === 'src/index.ts' || file === 'src/internal-apis.ts') continue
  
  const sourceFile = project.getSourceFile(join(projectRoot, file))
  if (!sourceFile) continue
  
  for (const [symbolName, exportInfo] of exports) {
    let isUsed = false
    
    // Check if file is imported anywhere
    const filesThatImport = fileUsage.get(file)
    if (filesThatImport && filesThatImport.size > 0) {
      // Check if this specific symbol is referenced
      const symbol = typeChecker.getSymbolAtLocation(exportInfo.declaration)
      if (symbol) {
        // Get all references to this symbol
        const references = symbol.getReferences()
        if (references.length > 1) {
          // More than 1 means it's used (1 is the definition itself)
          isUsed = true
        }
      }
    }
    
    // Also check if it's re-exported from index files
    if (!isUsed) {
      const indexFiles = [
        project.getSourceFile(join(projectRoot, 'src/index.ts')),
        project.getSourceFile(join(projectRoot, 'src/internal-apis.ts')),
      ]
      
      for (const indexFile of indexFiles) {
        if (!indexFile) continue
        
        for (const importDecl of indexFile.getImportDeclarations()) {
          const specifier = importDecl.getModuleSpecifierValue()
          const resolved = resolveImportPath(
            indexFile.getFilePath(),
            specifier
          )
          if (resolved && resolved.endsWith(file)) {
            // Check if this symbol is imported
            if (symbolName === 'default') {
              if (importDecl.getDefaultImport()) {
                isUsed = true
                break
              }
            } else {
              for (const namedImport of importDecl.getNamedImports()) {
                const importName = namedImport.getName()
                const aliasName = namedImport.getAliasNode()?.getText() || importName
                if (importName === symbolName || aliasName === symbolName) {
                  isUsed = true
                  break
                }
              }
            }
            if (isUsed) break
          }
        }
        if (isUsed) break
      }
    }
    
    if (!isUsed) {
      unusedExports.push({
        file,
        ...exportInfo,
      })
    }
  }
}

// Phase 4: Find unused files (files not imported by any other file)
console.log('🔍 Phase 4: Finding unused files...\n')

const unusedFiles = []
for (const [file, usage] of fileUsage) {
  // Skip entry points
  if (file === 'src/index.ts' || file === 'src/internal-apis.ts') continue
  
  // Check if file is imported by any other file
  if (usage.size === 0) {
    const exports = exportsMap.get(file)
    unusedFiles.push({
      file,
      exportCount: exports ? exports.size : 0,
    })
  }
}

// Phase 5: Find unreachable code
console.log('🔍 Phase 5: Finding unreachable code...\n')

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath()
  const relativePath = relative(projectRoot, filePath)
  
  sourceFile.forEachDescendant((node) => {
    const kind = node.getKindName()
    
    // Check for code after return
    if (kind === 'ReturnStatement') {
      const parent = node.getParent()
      if (parent && parent.getKindName() === 'Block') {
        const statements = parent.getStatements()
        const returnIndex = statements.findIndex((s) => s === node)
        if (returnIndex !== -1 && returnIndex < statements.length - 1) {
          const unreachable = statements[returnIndex + 1]
          unreachableCode.push({
            file: relativePath,
            line: unreachable.getStartLineNumber(),
            code: unreachable.getText().trim().substring(0, 80),
            reason: 'Code after return statement',
            context: node.getText().trim().substring(0, 50),
          })
        }
      }
    }
    
    // Check for code after throw
    if (kind === 'ThrowStatement') {
      const parent = node.getParent()
      if (parent && parent.getKindName() === 'Block') {
        const statements = parent.getStatements()
        const throwIndex = statements.findIndex((s) => s === node)
        if (throwIndex !== -1 && throwIndex < statements.length - 1) {
          const unreachable = statements[throwIndex + 1]
          unreachableCode.push({
            file: relativePath,
            line: unreachable.getStartLineNumber(),
            code: unreachable.getText().trim().substring(0, 80),
            reason: 'Code after throw statement',
            context: node.getText().trim().substring(0, 50),
          })
        }
      }
    }
  })
}

// Helper function to resolve import paths
function resolveImportPath(fromFile, importPath) {
  const fromDir = dirname(fromFile)
  let resolved
  
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolved = join(fromDir, importPath)
  } else {
    resolved = join(projectRoot, 'src', importPath)
  }
  
  // Try different extensions
  const extensions = ['.ts', '.js', '']
  for (const ext of extensions) {
    const withExt = ext ? `${resolved}${ext}` : resolved
    if (existsSync(withExt)) return withExt
    
    // Try index file
    const indexFile = join(resolved, `index${ext || '.ts'}`)
    if (existsSync(indexFile)) return indexFile
  }
  
  return null
}

// Print results
console.log('='.repeat(80))
console.log('📊 ANALYSIS RESULTS\n')

if (unusedExports.length > 0) {
  console.log(`❌ UNUSED EXPORTS (${unusedExports.length}):\n`)
  const byFile = new Map()
  for (const exp of unusedExports) {
    if (!byFile.has(exp.file)) {
      byFile.set(exp.file, [])
    }
    byFile.get(exp.file).push(exp)
  }
  
  for (const [file, exps] of Array.from(byFile.entries()).sort()) {
    console.log(`  📄 ${file}:`)
    for (const exp of exps) {
      console.log(`    - ${exp.name} (${exp.kind}) at line ${exp.line}`)
    }
    console.log()
  }
} else {
  console.log('✅ No unused exports found\n')
}

if (unusedFiles.length > 0) {
  console.log(`❌ UNUSED FILES (${unusedFiles.length}):\n`)
  for (const { file, exportCount } of unusedFiles.sort((a, b) =>
    a.file.localeCompare(b.file)
  )) {
    console.log(`  📄 ${file} (${exportCount} exports)`)
  }
  console.log()
} else {
  console.log('✅ No unused files found\n')
}

if (unreachableCode.length > 0) {
  console.log(`❌ UNREACHABLE CODE (${unreachableCode.length} instances):\n`)
  const byFile = new Map()
  for (const code of unreachableCode) {
    if (!byFile.has(code.file)) {
      byFile.set(code.file, [])
    }
    byFile.get(code.file).push(code)
  }
  
  for (const [file, codes] of Array.from(byFile.entries()).sort()) {
    console.log(`  📄 ${file}:`)
    // Show first 5 per file
    for (const code of codes.slice(0, 5)) {
      console.log(`    Line ${code.line}: ${code.reason}`)
      console.log(`      After: ${code.context}`)
      console.log(`      Code: ${code.code}...`)
    }
    if (codes.length > 5) {
      console.log(`    ... and ${codes.length - 5} more instances`)
    }
    console.log()
  }
} else {
  console.log('✅ No unreachable code found\n')
}

console.log('='.repeat(80))
console.log(`\n📈 Summary:`)
console.log(`  - Unused exports: ${unusedExports.length}`)
console.log(`  - Unused files: ${unusedFiles.length}`)
console.log(`  - Unreachable code instances: ${unreachableCode.length}`)

if (unusedExports.length > 0 || unusedFiles.length > 0 || unreachableCode.length > 0) {
  console.log(`\n💡 Tip: Review these findings carefully. Some may be false positives:`)
  console.log(`   - Exports used via dynamic imports or string references`)
  console.log(`   - Files that are entry points or used by external tools`)
  console.log(`   - Code that is intentionally unreachable (error handling)`)
  process.exit(1)
}
