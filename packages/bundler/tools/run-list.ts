import { createChunks, createDependencyGraph, createEntryChunks, createReverseDependencyGraph, createVirtualBarrelFile, groupChunkByDirectory } from '../dependencies/createDependencyGraph.ts';
import * as path from 'path';
import { project } from '../tsconfig.ts';
// Helper function for printing sets of files
function printFileSet(title: string, fileSet: Set<string>) {
  console.log(title);
  if (fileSet.size === 0) {
    console.log('   (empty)');
    return;
  }
  for (const filePath of fileSet) {
    console.log(`   • ${path.relative(process.cwd(), filePath)}`);
  }
}

async function main() {
  console.log('Analyzing project dependencies...');

  // 1. Initialize the ts-morph Project
  // This will automatically load files based on your tsconfig.json


 // 2. Call our pure functions to build both graphs
  const dependencyGraph = createDependencyGraph(project);
  const reverseGraph = createReverseDependencyGraph(dependencyGraph);

  // 3. Create the chunks
  const chunks = createChunks(dependencyGraph, reverseGraph);

  // --- Printing Logic (Updated) ---

  // Print forward graph (optional, but good for context)
  console.log('\n--- Dependencies Of (File -> What it imports) ---');
  // ... (printing code from previous step)
  for (const [filePath, dependencies] of dependencyGraph.entries()) {
    const relativeFilePath = path.relative(process.cwd(), filePath);
    console.log(`\n📄 ${relativeFilePath}`);
    if (dependencies.size > 0) {
      for (const depPath of dependencies) {
        console.log(`   └─> ${path.relative(process.cwd(), depPath)}`);
      }
    } else {
      console.log('   └─> (No project-internal dependencies)');
    }
  }


  // Print reverse graph (optional)
  console.log('\n\n--- Imported By (File <- Where it is used) ---');
  // ... (printing code from previous step)
  for (const filePath of dependencyGraph.keys()) {
    const relativeFilePath = path.relative(process.cwd(), filePath);
    console.log(`\n📄 ${relativeFilePath}`);
    const importers = reverseGraph.get(filePath);
    if (importers && importers.size > 0) {
      for (const importerPath of importers) {
        console.log(`   <─┘ ${path.relative(process.cwd(), importerPath)}`);
      }
    } else {
      console.log('   <─┘ (Not imported by any other project file)');
    }
  }

  // 4. Print the final chunks
  console.log('\n\n--- Discovered Chunks ---');
  chunks.forEach((chunk, index) => {
    console.log(`\n📦 Chunk ${index + 1}:`);
    chunk.forEach((filePath) => {
      console.log(`   • ${path.relative(process.cwd(), filePath)}`);
    });
  });

  console.log('\n--- Analysis Complete ---');


}


main().catch(console.error);