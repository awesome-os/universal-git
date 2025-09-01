import { Project } from 'ts-morph';
import { analyzeProjectSymbols } from '../dependencies/symbolAnalyzer.ts';
import { normalizePath, relative } from '../dependencies/pathUtils.ts';
import * as path from 'path';
import { project } from '../run.ts';
import { CONFIG } from '../tsconfig.ts';
// Let's reuse our multi-entry sample project for a good test case.
// src/
// ├── admin/
// │   ├── Dashboard.ts
// │   └── index.ts
// ├── components/
// │   └── Button.ts
// ├── utils/
// │   └── logger.ts
// └── main.ts

  // 1. Get the project's root directory path directly from ts-morph.
  // This is the most reliable way to establish the base for our relative paths.
  const projectRootDir = CONFIG.PROJECT_ROOT// project.getDirectoryPath();
  
  // 2. Normalize it once using our universal utility to ensure it's in the
  //    correct format for our `relative` function.
  const normalizedProjectRoot = normalizePath(projectRootDir);

async function main() {
  console.log('--- Analyzing Project Symbols ---');

  console.log(`Analyzing relative to project root: ${normalizedProjectRoot}`);
  
  // 3. Perform the analysis. The `filePath` keys in this map are absolute and normalized.
  const analysis = analyzeProjectSymbols(project);
  
  const resultObject: Record<string, any> = {};
  for (const [filePath, fileAnalysis] of analysis.entries()) {
    // 4. Use our PURE and UNIVERSAL `relative` function.
    // It takes two absolute paths (`from` and `to`) and returns the relative path.
    // This is exactly what it was designed for.
    const relativePath = relative(normalizedProjectRoot, filePath);
    
    // 5. Use this clean, POSIX-style path as the key for our JSON output.
    resultObject[relativePath] = fileAnalysis;
  }
  
  console.log(JSON.stringify(resultObject, null, 2));

  console.log('\n--- Analysis Complete ---');
}

main().catch(console.error);