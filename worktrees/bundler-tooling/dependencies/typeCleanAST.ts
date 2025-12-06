// typeCleanerAST.ts
import { Project, SourceFile, ts, Node, type Statement, ExportDeclaration } from 'ts-morph';


/**
 * A pure function that cleans a bundled TypeScript declaration file using the AST.
 * This is the final, definitive, and most powerful version. It solves duplicate
 * identifiers, multiple default exports, and creates a single, cohesive module.
 *
 * @param declarationContent The raw, bundled .d.ts file content.
 * @returns A cleaned string of the .d.ts file content.
 */
export function cleanupDeclarationFileAST(declarationContent: string): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('virtual.d.ts', declarationContent);

    // --- Phase 1: Deep Analysis and Harvesting (Read-Only) ---
    const declarationsByName = new Map<string, Statement[]>();
    const namedSymbolsToExport = new Set<string>();
    const defaultExportProperties = new Set<string>();

    sourceFile.getStatements().forEach(statement => {
        // Collect all named declarations
        let name: string | undefined;
        if (Node.isNameable(statement)) name = statement.getName();
        if (Node.isVariableStatement(statement)) name = statement.getDeclarations()[0]?.getName();
        if (name) {
            const existing = declarationsByName.get(name) || [];
            existing.push(statement);
            declarationsByName.set(name, existing);
        }
        // Harvest export intentions
        if (Node.isExportDeclaration(statement)) {
            statement.getNamedExports().forEach(ne => namedSymbolsToExport.add(ne.getName()));
        }
        if (Node.isExportAssignment(statement)) {
            const expression = statement.getExpression();
            if (Node.isIdentifier(expression)) {
                const symbol = expression.getSymbol();
                const decl = symbol?.getDeclarations().find(Node.isModuleDeclaration);
                if (decl) {
                    decl.getStatements().forEach(st => {
                        if (Node.isExportDeclaration(st)) st.getNamedExports().forEach(ne => defaultExportProperties.add(ne.getName()));
                    });
                }
            }
        }
        if (Node.isExportable(statement) && statement.hasExportKeyword()) {
            if (Node.isVariableStatement(statement)) {
                statement.getDeclarations().forEach(decl => namedSymbolsToExport.add(decl.getName()));
            } else if (Node.isNameable(statement) && statement.getName()) {
                namedSymbolsToExport.add(statement.getName()!);
            }
        }
    });

    // --- Phase 2: Intelligent De-duplication (Write) ---
    for (const [name, declarations] of declarationsByName.entries()) {
        if (declarations.length > 1) {
            // Find the "best" declaration (longest text) and remove the others.
            let winner = declarations[0];
            for (let i = 1; i < declarations.length; i++) {
                if (declarations[i].getFullWidth() > winner.getFullWidth()) {
                    winner = declarations[i];
                }
            }
            declarations.forEach(decl => {
                if (decl !== winner && !decl.wasForgotten()) {
                    decl.remove();
                }
            });
        }
    }

    // --- Phase 3: Sanitize and Strip Exports (Write) ---
    const nodesToRemove: Node[] = [];
    sourceFile.getStatements().forEach(statement => {
        if (Node.isExportDeclaration(statement) || Node.isExportAssignment(statement)) {
            nodesToRemove.push(statement);
            return;
        }
        if (Node.isModuleDeclaration(statement) && statement.getName() === '_default') {
            nodesToRemove.push(statement);
            return;
        }
        if (Node.isExportable(statement) && statement.hasExportKeyword()) {
            statement.setIsExported(false);
            if (
                Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement) ||
                Node.isVariableStatement(statement) || Node.isEnumDeclaration(statement) ||
                Node.isModuleDeclaration(statement)
            ) {
                statement.setHasDeclareKeyword(true);
            }
        }
    });
    nodesToRemove.forEach(node => !node.wasForgotten() && node.remove());

    // --- Phase 4: Final Cleanup and Rebuilding (Write) ---
    sourceFile.getImportDeclarations().forEach(imp => {
        if (imp.getModuleSpecifierValue().startsWith('.')) imp.remove();
    });
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.ImportType).forEach(importType => {
        const qualifier = importType.getQualifier();
        if (qualifier && Node.isIdentifier(qualifier) && declarationsByName.has(qualifier.getText())) {
            importType.replaceWithText(qualifier.getText());
        }
    });
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.JSDoc).forEach(doc => doc.remove());

    // Rebuild the export structure correctly.
    if (defaultExportProperties.size > 0) {
        sourceFile.addStatements(`declare const _default: {\n    ${Array.from(defaultExportProperties).sort().join(';\n    ')};\n};`);
        sourceFile.addExportAssignment({ isExportEquals: false, expression: '_default' });
    }
    if (namedSymbolsToExport.size > 0) {
        sourceFile.addExportDeclaration({ namedExports: Array.from(namedSymbolsToExport).sort() });
    }

    sourceFile.formatText({ indentSize: 4, convertTabsToSpaces: true });
    return sourceFile.getFullText().trim();
}
// /**
//  * A pure function that cleans a bundled TypeScript declaration file using the AST.
//  * This is the final, most powerful version.
//  *
//  * It performs a comprehensive "export flattening" and cleanup:
//  * 1. Removes all relative import statements.
//  * 2. Collects all intended named and default exports from all export patterns.
//  * 3. Removes ALL original export statements (`export *`, `export default`, namespaces).
//  * 4. Strips the `export` keyword from individual declarations.
//  * 5. Simplifies redundant inline `import(...)` types.
//  * 6. Removes all JSDOC comments.
//  * 7. Re-builds a single, consolidated `export {...}` and `export default {...}` at the end.
//  *
//  * @param declarationContent The raw, bundled .d.ts file content.
//  * @returns A cleaned string of the .d.ts file content.
//  */
// export function cleanupDeclarationFileAST(declarationContent: string): string {
//     const project = new Project({ useInMemoryFileSystem: true });
//     const sourceFile = project.createSourceFile('virtual.d.ts', declarationContent);

//     const namedSymbolsToExport = new Set<string>();
//     const defaultExportProperties = new Set<string>();
//     const nodesToRemove: Node[] = [];

//     for (const statement of sourceFile.getStatements()) {
//         if (Node.isExportDeclaration(statement)) {
//             statement.getNamedExports().forEach(ne => namedSymbolsToExport.add(ne.getName()));
//             nodesToRemove.push(statement);
//             continue;
//         }

//         if (Node.isExportAssignment(statement)) {
//             const expression = statement.getExpression();
//             if (Node.isIdentifier(expression)) {
//                 const symbol = expression.getSymbol();
//                 if (symbol) {
//                     // ✨ --- THE FIX IS HERE --- ✨
//                     // The check for `declare namespace ...` is `Node.isModuleDeclaration`.
//                     const decl = symbol.getDeclarations().find(Node.isModuleDeclaration);
                    
//                     if (decl && decl.getName() === expression.getText()) {
//                         decl.getStatements().forEach(st => {
//                             if (Node.isExportDeclaration(st)) {
//                                 st.getNamedExports().forEach(ne => defaultExportProperties.add(ne.getName()));
//                             }
//                         });
//                         nodesToRemove.push(decl);
//                     }
//                 }
//             }
//             nodesToRemove.push(statement);
//             continue;
//         }
        
//         if (Node.isExportable(statement) && statement.hasExportKeyword()) {
//             if (Node.isVariableStatement(statement)) {
//                 statement.getDeclarations().forEach(decl => namedSymbolsToExport.add(decl.getName()));
//             } else if (Node.isNameable(statement) && statement.getName()) {
//                 namedSymbolsToExport.add(statement.getName()!);
//             }
//             statement.setIsExported(false);
//         }
//     }
    
//     // --- The rest of the function is unchanged and correct ---
//     nodesToRemove.forEach(node => !node.wasForgotten() && node.remove());
    
//     sourceFile.getImportDeclarations().forEach(imp => {
//         if (imp.getModuleSpecifierValue().startsWith('.')) imp.remove();
//     });

//     const declaredSymbols = new Set<string>();
//     sourceFile.getStatements().forEach(statement => {
//         if (Node.isNameable(statement) && statement.getName()) declaredSymbols.add(statement.getName()!);
//         if (Node.isVariableStatement(statement)) {
//             statement.getDeclarations().forEach(decl => declaredSymbols.add(decl.getName()));
//         }
//     });

//     sourceFile.getDescendantsOfKind(ts.SyntaxKind.ImportType).forEach(importType => {
//         const qualifier = importType.getQualifier();
//         if (qualifier && Node.isIdentifier(qualifier) && declaredSymbols.has(qualifier.getText())) {
//             importType.replaceWithText(qualifier.getText());
//         }
//     });
    
//     sourceFile.getDescendantsOfKind(ts.SyntaxKind.JSDoc).forEach(doc => doc.remove());

//     if (defaultExportProperties.size > 0) {
//         sourceFile.addExportAssignment({
//             isExportEquals: false,
//             expression: `{ ${Array.from(defaultExportProperties).sort().join(', ')} }`,
//         });
//     }

//     if (namedSymbolsToExport.size > 0) {
//         sourceFile.addExportDeclaration({
//             namedExports: Array.from(namedSymbolsToExport).sort(),
//         });
//     }

//     sourceFile.formatText({ indentSize: 4, convertTabsToSpaces: true });
//     return sourceFile.getFullText().trim();
// }