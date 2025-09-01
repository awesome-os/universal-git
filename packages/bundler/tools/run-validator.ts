import { Project } from 'ts-morph';
import { bundleDeclarationFiles } from '../dependencies/typeBundler.ts';
import { validateProjectWithTypes } from '../dependencies/typeValidator.ts';
import { normalizePath } from '../dependencies/pathUtils.ts';
import { project, projectRoot } from '../tsconfig.ts';
const normalizedProjectRoot = normalizePath(projectRoot);
// async function main() {
//   console.log('--- Validating Project with Generated Types ---');

  

//   // --- Step 2: Generate the Bundled Declaration File ---
//   console.log('\n1. Generating bundled types from JSDOC...');
//   const jsFilesToProcess = new Map<string, string>();
//   for (const sourceFile of project.getSourceFiles()) {
//     const filePath = normalizePath(sourceFile.getFilePath());
//     if (filePath.endsWith('.js') && !filePath.includes('/node_modules/')) {
//       jsFilesToProcess.set(filePath, sourceFile.getFullText());
//     }
//   }
//   const bundledTypes = await bundleDeclarationFiles(jsFilesToProcess, normalizedProjectRoot);
//   console.log('   ...Type generation complete.');

//   // --- Step 3: Validate the Project Against the Generated Types ---
//   console.log('\n2. Running type validation...');
//   const validationResults = await validateProjectWithTypes(project, bundledTypes);
//   console.log('   ...Validation complete.');

//   // --- Step 4: Print the Results ---
//   console.log('\n--- Validation Results ---');
//   if (validationResults.length === 0) {
//     console.log('✅ Success! No type errors found.');
//   } else {
//     console.log(`❌ Found ${validationResults.length} error(s)/warning(s):`);
//     for (const result of validationResults) {
//       const location = result.filePath ? `${result.filePath}:${result.lineNumber}` : 'global';
//       console.log(`\n  [${location}]`);
//       console.log(`  ${result.message.replace(/\n/g, '\n  ')}`);
//     }
//   }

//   console.log('\n--- Validation Finished ---');
// }

// main().catch(console.error);

import { writeFile } from 'fs/promises'; // ✨ Import the file writing function
import * as path from 'path';           // ✨ Import Node's path module for joining paths
import { cleanupDeclarationFileAST } from '../dependencies/typeCleanAST.ts';

async function main() {
  console.log('--- Validating Project and Writing Types ---');

  // ✨ Use `import.meta.dirname` to get the directory of the currently running script.
  // This is the modern, ESM-native way to do this.
  const scriptDir = import.meta.dirname;

 // --- Step 2: Generate the Bundled Declaration File ---
  console.log('\n1. Generating bundled types from JSDOC...');
  const jsFilesToProcess = new Map<string, string>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalizePath(sourceFile.getFilePath());
    if (filePath.endsWith('.js') && !filePath.includes('/node_modules/')) {
      jsFilesToProcess.set(filePath, sourceFile.getFullText());
    }
  }
  const bundledTypes = (await bundleDeclarationFiles(jsFilesToProcess, normalizedProjectRoot)).replaceAll('FSClient','FsClient');
  console.log('   ...Type generation complete.');

  // ✨ --- UPDATED STEP: CLEAN THE GENERATED TYPES WITH THE AST CLEANER --- ✨
  console.log('\n2. Cleaning up generated declaration file using AST...');
  // Use the new AST-based function here.
  const cleanedTypes = cleanupDeclarationFileAST(bundledTypes);
  console.log('   ...Cleanup complete.');


  // --- Step 3: Write the Bundled Types to Disk --- ✨
  const outputPath = path.join(import.meta.dirname, 'types.d.ts');
  console.log(`\n3. Writing cleaned types to: ${outputPath}`);
  await writeFile(outputPath, cleanedTypes, 'utf-8');
  console.log('   ...Write complete.');

  // --- Step 4: Validate the Project Against the Generated Types ---
  console.log('\n3. Running type validation...');
  const allValidationResults = await validateProjectWithTypes(project, cleanedTypes);
  console.log('   ...Validation complete.');

   // ✨ --- NEW: Filter the Results --- ✨
  console.log('\n4. Filtering results for errors within generated types...');
  
  // This is the hardcoded path we used inside the `validateProjectWithTypes` function.
  const VIRTUAL_TYPES_PATH = '/types.d.ts'; 
  
  const filteredResults = allValidationResults.filter(
    result => result.filePath === VIRTUAL_TYPES_PATH
  );
  console.log(`   ...Found ${filteredResults.length} relevant issue(s).`);

  // --- Step 5: Print the FILTERED Results ---
  console.log('\n--- Validation Results (for generated types.d.ts only) ---');
  if (filteredResults.length === 0) {
    console.log('✅ Success! No internal type errors found in the generated declaration file.');
  } else {
    console.log(`❌ Found ${filteredResults.length} error(s)/warning(s) originating from the bundled types file:`);
    for (const result of filteredResults) {
      // The location will always be our virtual file, but this formatting is robust.
      const location = result.filePath ? `${result.filePath}:${result.lineNumber}` : 'global';
      console.log(`\n  [${location}]`);
      console.log(`  ${result.message.replace(/\n/g, '\n  ')}`);
    }
  }

  console.log('\n--- Process Finished ---');
}

main().catch(console.error);