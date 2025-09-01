import { bundleByDirectory } from '../bundler.ts';
import { normalizePath, resolve, relative } from '../dependencies/pathUtils.ts';
import * as path from 'path';
import { CONFIG, project } from '../tsconfig.ts';


  // --- Setup ---
  
  
  const projectRoot = normalizePath(CONFIG.SRC_DIR);
  const outputDir = normalizePath(CONFIG.OUT_DIR);
  const entryPoints = [
    normalizePath(path.resolve(projectRoot, 'index.js')),
    normalizePath(path.resolve(projectRoot, 'internal-apis.js')),
  ];



async function main() {
  console.log('--- Starting Universal-Git Bundler ---');



  console.log('\nProject Root:', projectRoot);
  console.log('Entry Points:', entryPoints);
  
  // --- Bundling ---
  const bundledOutput = bundleByDirectory(project, entryPoints, projectRoot, outputDir);

  // --- Output Results ---
  console.log('\n\n--- Bundled Output Files ---');

  // Sort files for consistent output: index.js first, then alphabetically.
  const sortedFiles = Array.from(bundledOutput.keys()).sort((a, b) => {
      if (a === 'index.js') return -1;
      if (b === 'index.js') return 1;
      return a.localeCompare(b);
  });

  for (const fileName of sortedFiles) {
    const content = bundledOutput.get(fileName)!;
    console.log(`\n\n// --- FILE: ${relative(CONFIG.PROJECT_ROOT,CONFIG.OUT_DIR)}/${relative(CONFIG.OUT_DIR,resolve(CONFIG.OUT_DIR,fileName))} ---`);
    console.log(`\n\n// --- FILE: ${CONFIG.OUT_DIR} ${resolve(CONFIG.OUT_DIR+"/",fileName)} ---`);
    console.log('//' + '-'.repeat(70));
    console.log(content);
  }

  console.log(`\n\n--- Bundling Complete: ${bundledOutput.size} files generated. ---`);
}

main().catch(console.error);