import { Project } from 'ts-morph';
import { bundleDeclarationFiles } from '../dependencies/typeBundler.ts';
import { normalizePath } from '../dependencies/pathUtils.ts';
import { projectRoot, project } from '../tsconfig.ts';
async function main() {
  console.log('--- Bundling Declaration Files from JSDOC ---');



  
  
  // Step 1: Collect all JavaScript files from the project.
  const jsFilesToProcess = new Map<string, string>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalizePath(sourceFile.getFilePath());
    if (filePath.endsWith('.js') && !filePath.includes('/node_modules/')) {
      jsFilesToProcess.set(filePath, sourceFile.getFullText());
    }
  }
  
  console.log(`Found ${jsFilesToProcess.size} JS file(s) to process.`);

  // Step 2: Pass the collected files to our new bundler function.
  const bundledTypes = await bundleDeclarationFiles(jsFilesToProcess, projectRoot);

  // Step 3: Print the single, unified result.
  console.log('\n--- Bundled types.d.ts Content ---');
  console.log('//' + '-'.repeat(70));
  if (bundledTypes.trim()) {
      console.log(bundledTypes);
  } else {
      console.log('// (No declarations were generated)');
  }
  console.log('//' + '-'.repeat(70));

  console.log('\n--- Type Bundling Complete ---');
}

main().catch(console.error);