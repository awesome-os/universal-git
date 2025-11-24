const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Replace from './something.js' or from '../something.js' with .ts
  const fromPattern = /from\s+['"](\.\.?\/[^'"]+)\.js['"]/g;
  if (fromPattern.test(content)) {
    content = content.replace(fromPattern, (match, p1) => {
      modified = true;
      return `from '${p1}.ts'`;
    });
  }

  // Replace import('./something.js') with import('./something.ts')
  const importPattern = /import\(['"](\.\.?\/[^'"]+)\.js['"]\)/g;
  if (importPattern.test(content)) {
    content = content.replace(importPattern, (match, p1) => {
      modified = true;
      return `import('${p1}.ts')`;
    });
  }

  // Replace require('./something.js') with require('./something.ts')
  const requirePattern = /require\(['"](\.\.?\/[^'"]+)\.js['"]\)/g;
  if (requirePattern.test(content)) {
    content = content.replace(requirePattern, (match, p1) => {
      modified = true;
      return `require('${p1}.ts')`;
    });
  }

  // Replace JSDoc type imports: import('../types.js') with import('../types.ts')
  const jsdocPattern = /import\(['"](\.\.?\/[^'"]+)\.js['"]\)/g;
  if (jsdocPattern.test(content)) {
    content = content.replace(jsdocPattern, (match, p1) => {
      modified = true;
      return `import('${p1}.ts')`;
    });
  }

  // Also handle double quotes
  const fromPattern2 = /from\s+["'](\.\.?\/[^"']+)\.js["']/g;
  if (fromPattern2.test(content)) {
    content = content.replace(fromPattern2, (match, p1) => {
      modified = true;
      return `from "${p1}.ts"`;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  return false;
}

const srcDir = path.join(__dirname, 'src');
const files = getAllFiles(srcDir);
let count = 0;

files.forEach((file) => {
  if (fixImports(file)) {
    count++;
  }
});

console.log(`\nFixed ${count} files.`);

