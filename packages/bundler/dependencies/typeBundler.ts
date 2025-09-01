import { Project, ts } from 'ts-morph';
import { relative } from './pathUtils.ts'; // We need our universal relative path function

/**
 * Generates a single, bundled TypeScript declaration file (.d.ts) in memory
 * from a set of JavaScript source files containing JSDOC type annotations.
 * Each block of types in the final file is commented with its original source path.
 *
 * @param sourceFiles A Map where the key is the absolute, normalized file path
 *   and the value is the content of the source file.
 * @param projectRoot The absolute, normalized path to the project's root, used for
 *   calculating relative paths for the comments.
 * @returns A Promise that resolves to a single string containing the content
 *   of the bundled declaration file.
 */
export async function bundleDeclarationFiles(
  sourceFiles: Map<string, string>,
  projectRoot: string
): Promise<string> {
  // Step 1: Create an isolated, in-memory TypeScript project.
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      declaration: true,
      emitDeclarationOnly: true,
      // Use a modern target to ensure all JSDOC features are understood.
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
  });

  // Step 2: Add all source files to the virtual project.
  for (const [filePath, content] of sourceFiles.entries()) {
    project.createSourceFile(filePath, content);
  }

  // Step 3: Emit the declaration files into the in-memory file system.
  const emitResult = await project.emit();
  const diagnostics = emitResult.getDiagnostics();
  if (diagnostics.length > 0) {
    console.warn('TypeScript diagnostics found during declaration emit:');
    console.warn(project.formatDiagnosticsWithColorAndContext(diagnostics));
  }
  const outputFileSystem = project.getFileSystem();

  // Step 4: Iterate through the ORIGINAL source files and assemble the bundled output.
  const bundledContent: string[] = [];
  const sortedSourceFiles = Array.from(sourceFiles.keys()).sort();

  for (const originalFilePath of sortedSourceFiles) {
    // Determine the expected output path for the declaration file.
    // e.g., 'C:/.../tmp/typedefs.js' -> 'C:/.../tmp/typedefs.d.ts'
    const declarationPath = originalFilePath.replace(/\.js$/, '.d.ts');

    try {
      // Try to read the generated .d.ts content from the virtual file system.
      const declarationContent = outputFileSystem.readFileSync(declarationPath);
      
      if (declarationContent.trim()) {
        // Calculate the relative path for the header comment.
        const relativeSourcePath = relative(projectRoot, originalFilePath);

        // Create the header and append the content.
        const header = `// --- from ./${relativeSourcePath} ---`;
        bundledContent.push(header);
        bundledContent.push(declarationContent.trim());
      }
    } catch (error) {
      // It's normal for some JS files not to produce any declarations, so we can ignore errors here.
    }
  }

  // Step 5: Join all the blocks into a single string.
  return bundledContent.join('\n\n');
}