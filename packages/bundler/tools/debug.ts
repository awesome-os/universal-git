// debug.ts
import { Project } from 'ts-morph';
import { createDependencyGraph } from '../dependencies/createDependencyGraph.ts';
import * as path from 'path';
import { project} from '../run.ts';
import { entryPoints } from '../tsconfig.ts';
import { CONFIG } from '../tsconfig.ts';
import { normalizePath } from '../dependencies/pathUtils.ts';


async function debug() {
  console.log('--- Starting Debug Analysis ---');

  // Add a check for "allowJs" if you're using JS files
  const allowJs = project.getCompilerOptions().allowJs;
  if (!allowJs) {
      console.warn('⚠️ WARNING: "allowJs" is not enabled in your tsconfig.json. JavaScript files may be ignored.');
  }

  // 2. Build the dependency graph
  const dependencyGraph = createDependencyGraph(project);

  console.log('\n--- Checking Entry Points ---');
  console.log('Your defined entry points are:');
  entryPoints.map(normalizePath).forEach(ep => console.log(`  - ${ep}`));

  // 4. Get all file paths that ts-morph found and put in the graph
  const graphKeys = new Set(dependencyGraph.keys());
  console.log(`\n--- Files Found by ts-morph (${graphKeys.size} total) ---`);
  if (graphKeys.size === 0) {
      console.error('❌ ERROR: No source files were found! Check your `include` pattern in tsconfig.json.');
      return;
  }
  graphKeys.forEach(key => console.log(`  • ${key}`));

  // 5. Cross-reference your entry points with the found files
  console.log('\n--- Verification Result ---');
  let allFound = true;
  for (const entryPoint of entryPoints) {
    if (graphKeys.has(entryPoint)) {
      console.log(`✅ FOUND: ${entryPoint}`);
    } else {
      console.error(`❌ NOT FOUND: ${entryPoint}`);
      allFound = false;
    }
  }

  if (allFound) {
      console.log('\nCONCLUSION: All entry points were found in the graph. The issue may be with the `export *` resolution. Check file paths within your entry points.');
  } else {
      console.error('\nCONCLUSION: At least one entry point was NOT found in the graph. This is the root cause. Please fix the path mismatch or your tsconfig.json configuration.');
  }
}

debug().catch(console.error);