import { Project } from 'ts-morph';
import { analyzeProjectSymbols } from '../dependencies/symbolAnalyzer.ts';
import { generateInterfaceFiles } from '../dependencies/interfaceGenerator.ts';
import { relative } from '../dependencies/pathUtils.ts'; // Using our pure 'relative' for output display
import { project} from '../tsconfig.ts'
import { projectRoot } from '../tsconfig.ts';
async function main() {
  console.log('--- Generating Module Interfaces ---');



  // Step 1: Analyze the project to get the symbol data.
  const analysis = analyzeProjectSymbols(project);

  // Step 2: Generate the interface file content from the analysis.
  const interfaceFiles = generateInterfaceFiles(analysis);

  // Step 3: Print the results to the console.
  console.log('\n--- Generated Content ---');
  for (const [filePath, content] of interfaceFiles.entries()) {
    const relativePath = relative(projectRoot, filePath);
    console.log(`\n// --- FILE: ${relativePath} ---`);
    console.log('//' + '-'.repeat(70));
    console.log(content.trim() ? content.trim() : '// (No public interface)');
  }

  console.log('\n--- Generation Complete ---');
}

main().catch(console.error);