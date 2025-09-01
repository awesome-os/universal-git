import { Project, ts, Diagnostic } from 'ts-morph';
import { normalizePath } from './pathUtils.ts';

/**
 * A simple, serializable representation of a TypeScript diagnostic message (an error or warning).
 */
export interface ValidationResult {
  message: string;
  filePath?: string;
  lineNumber?: number;
}

// /**
//  * A pure function that type-checks a project against a provided string of
//  * TypeScript declaration content. It finds unresolved types and other errors.
//  *
//  * This function is non-destructive. It creates a temporary, in-memory copy
//  * of the project to perform the validation, leaving the original project untouched.
//  *
//  * @param projectToAnalyse The original ts-morph Project instance to validate.
//  * @param declarationFileContent A string containing the bundled .d.ts content.
//  * @returns A Promise that resolves to an array of `ValidationResult` objects,
//  *   one for each diagnostic found. An empty array means the validation passed.
//  */
// export async function validateProjectWithTypes(
//   projectToAnalyse: Project,
//   declarationFileContent: string
// ): Promise<ValidationResult[]> {
//   // ... (Steps 1, 2, and 3 are unchanged)
//   const validationProject = new Project({
//     useInMemoryFileSystem: true,
//     compilerOptions: projectToAnalyse.getCompilerOptions(),
//   });

//   for (const sourceFile of projectToAnalyse.getSourceFiles()) {
//     if (!sourceFile.isDeclarationFile()) {
//       validationProject.createSourceFile(sourceFile.getFilePath(), sourceFile.getFullText());
//     }
//   }
  
//   validationProject.createSourceFile('/_universal_git_types.d.ts', declarationFileContent);

//   const diagnostics = await validationProject.getPreEmitDiagnostics();
//   const results: ValidationResult[] = [];
  
//   for (const diagnostic of diagnostics) {
//     const sourceFile = diagnostic.getSourceFile();
    
//     // ✨ --- THE FIX --- ✨
//     // The `diagnostic.getMessageText()` can be a string or a `DiagnosticMessageChain`.
//     // The `ts.flattenDiagnosticMessageText` function correctly handles both cases
//     // and is guaranteed to return a single, formatted string.
//     const messageText = diagnostic.getMessageText();
//     const message = ts.flattenDiagnosticMessageText( /** @ts-ignore */ 
//         messageText, '\n');
    
//     results.push({
//       message: message,
//       filePath: sourceFile ? normalizePath(sourceFile.getFilePath()) : undefined,
//       lineNumber: sourceFile && diagnostic.getStart() !== undefined 
//         ? sourceFile.getLineAndColumnAtPos(diagnostic.getStart()!).line 
//         : undefined,
//     });
//   }

//   return results;
// }



// /**
//  * A pure function that type-checks a project against a provided string of
//  * TypeScript declaration content. It now filters out irrelevant module resolution errors.
//  */
// export async function validateProjectWithTypes(
//   projectToAnalyse: Project,
//   declarationFileContent: string
// ): Promise<ValidationResult[]> {
//   const validationProject = new Project({
//     useInMemoryFileSystem: true,
//     compilerOptions: {
//       ...projectToAnalyse.getCompilerOptions(),
//       allowJs: true,
//     },
//   });

//   for (const sourceFile of projectToAnalyse.getSourceFiles()) {
//     if (!sourceFile.isDeclarationFile()) {
//       validationProject.createSourceFile(
//         sourceFile.getFilePath(),
//         sourceFile.getFullText()
//       );
//     }
//   }

//   validationProject.createSourceFile('/types.d.ts', declarationFileContent);

//   const diagnostics = await validationProject.getPreEmitDiagnostics();
//   const results: ValidationResult[] = [];

//   // ✨ --- THE FIX: INTELLIGENTLY FILTER DIAGNOSTICS --- ✨
//   for (const diagnostic of diagnostics) {
//     const code = diagnostic.getCode();
//     const messageText = ts.flattenDiagnosticMessageText(diagnostic.getMessageText(), '\n');

//     // TS2307: Cannot find module '...' or its corresponding type declarations.
//     if (code === 2307) {
//       // This is a module resolution error. We only want to ignore errors
//       // for EXTERNAL packages, not for missing local files.
//       // External packages are "bare specifiers" (e.g., 'async-lock').
//       // Local files start with '.' or '/'.
//       const match = messageText.match(/Cannot find module '([^']*)'/);
//       if (match) {
//         const moduleName = match[1];
//         if (!moduleName.startsWith('.')) {
//           // This is a bare specifier. It's an external dependency we
//           // don't care about in this context. Skip it.
//           continue;
//         }
//       }
//     }

//     // If we're here, it's an error we care about (a type error, a syntax error,
//     // or a missing LOCAL module).
//     const sourceFile = diagnostic.getSourceFile();
//     results.push({
//       message: messageText,
//       filePath: sourceFile ? normalizePath(sourceFile.getFilePath()) : undefined,
//       lineNumber: sourceFile && diagnostic.getStart() !== undefined
//         ? sourceFile.getLineAndColumnAtPos(diagnostic.getStart()!).line
//         : undefined,
//     });
//   }

//   return results;
// }


/**
 * A pure function that type-checks a project against a provided string of
 * TypeScript declaration content. It now creates a clean "consumer" environment
 * by excluding type-only source files from the validation context.
 */
export async function validateProjectWithTypes(
  projectToAnalyse: Project,
  declarationFileContent: string
): Promise<ValidationResult[]> {
  const validationProject = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      ...projectToAnalyse.getCompilerOptions(),
      allowJs: true,
    },
  });

  // ✨ --- THE FIX --- ✨
  // Replicate the original project's source files, but EXCLUDE files that
  // contain no executable code (i.e., they are JSDOC/type-only files).
  for (const sourceFile of projectToAnalyse.getSourceFiles()) {
    if (sourceFile.isDeclarationFile()) {
      continue; // Always skip existing .d.ts files.
    }

    // HEURISTIC: If a source file has no statements, it has no runtime code.
    // It's a file like `typedefs.js` whose only purpose is for type generation.
    // We must exclude it from the validation project to avoid ambiguity.
    if (sourceFile.getStatements().length === 0) {
      console.log(`(Validator: Excluding type-only file from validation context: ${normalizePath(sourceFile.getFilePath())})`);
      continue;
    }

    // This is a file with runtime code, so we include it.
    validationProject.createSourceFile(
      sourceFile.getFilePath(),
      sourceFile.getFullText()
    );
  }

  // Add our single, bundled declaration file. This is now the ONLY source of types.
  validationProject.createSourceFile('/types.d.ts', declarationFileContent);

  // The rest of the function (running diagnostics and filtering) is unchanged.
  const diagnostics = await validationProject.getPreEmitDiagnostics();
  const results: ValidationResult[] = [];

  for (const diagnostic of diagnostics) {
    const code = diagnostic.getCode();
    const messageText = ts.flattenDiagnosticMessageText(diagnostic.getMessageText(), '\n');

    if (code === 2307) {
      const match = messageText.match(/Cannot find module '([^']*)'/);
      if (match) {
        const moduleName = match[1];
        if (!moduleName.startsWith('.')) {
          continue;
        }
      }
    }

    const sourceFile = diagnostic.getSourceFile();
    results.push({
      message: messageText,
      filePath: sourceFile ? normalizePath(sourceFile.getFilePath()) : undefined,
      lineNumber: sourceFile && diagnostic.getStart() !== undefined
        ? sourceFile.getLineAndColumnAtPos(diagnostic.getStart()!).line
        : undefined,
    });
  }

  return results;
}