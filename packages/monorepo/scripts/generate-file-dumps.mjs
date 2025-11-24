import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { join, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

async function getAllFiles(dir, fileList = []) {
  const files = await readdir(dir, { withFileTypes: true })
  
  for (const file of files) {
    const filePath = join(dir, file.name)
    
    if (file.isDirectory()) {
      await getAllFiles(filePath, fileList)
    } else {
      fileList.push(filePath)
    }
  }
  
  return fileList
}

async function getFileStats(filePath) {
  try {
    const stats = await stat(filePath)
    return {
      path: filePath,
      created: stats.birthtime,
      modified: stats.mtime,
      size: stats.size
    }
  } catch (error) {
    console.error(`Error getting stats for ${filePath}:`, error.message)
    return null
  }
}

async function generateFileList() {
  console.log('Collecting files from src and tests directories...')
  
  const srcFiles = await getAllFiles(join(rootDir, 'src'))
  const testFiles = await getAllFiles(join(rootDir, 'tests'))
  
  const allFiles = [...srcFiles, ...testFiles]
  
  console.log(`Found ${allFiles.length} files. Getting file stats...`)
  
  const fileStats = []
  for (const file of allFiles) {
    const stats = await getFileStats(file)
    if (stats) {
      fileStats.push(stats)
    }
  }
  
  // Sort by creation date
  fileStats.sort((a, b) => a.created - b.created)
  
  // Generate markdown content
  let markdown = '# File List\n\n'
  markdown += `Generated on: ${new Date().toISOString()}\n\n`
  markdown += `Total files: ${fileStats.length}\n\n`
  markdown += '## Files\n\n'
  markdown += '| Path | Created | Modified | Size (bytes) |\n'
  markdown += '|------|---------|----------|--------------|\n'
  
  for (const file of fileStats) {
    const relPath = relative(rootDir, file.path)
    const created = file.created.toISOString()
    const modified = file.modified.toISOString()
    markdown += `| ${relPath} | ${created} | ${modified} | ${file.size} |\n`
  }
  
  await writeFile(join(rootDir, 'file_list.md'), markdown, 'utf-8')
  console.log('✓ Created file_list.md')
}

async function concatenateTsFiles(dir, outputFile, excludePatterns = []) {
  console.log(`\nCollecting .ts files from ${dir}...`)
  
  const allFiles = await getAllFiles(dir)
  const tsFiles = allFiles.filter(file => {
    if (!file.endsWith('.ts')) return false
    
    // Check if file should be excluded
    const relPath = relative(rootDir, file)
    return !excludePatterns.some(pattern => relPath.includes(pattern))
  })
  
  // Sort files for consistent output
  tsFiles.sort()
  
  console.log(`Found ${tsFiles.length} .ts files. Concatenating...`)
  
  let output = `// Concatenated TypeScript files from ${relative(rootDir, dir)}\n`
  output += `// Generated on: ${new Date().toISOString()}\n`
  output += `// Total files: ${tsFiles.length}\n\n`
  output += '='.repeat(80) + '\n\n'
  
  for (const file of tsFiles) {
    const relPath = relative(rootDir, file)
    output += `// ${'='.repeat(78)}\n`
    output += `// File: ${relPath}\n`
    output += `// ${'='.repeat(78)}\n\n`
    
    try {
      const content = await readFile(file, 'utf-8')
      output += content
      output += '\n\n'
    } catch (error) {
      console.error(`Error reading ${file}:`, error.message)
      output += `// ERROR: Could not read file\n\n`
    }
  }
  
  await writeFile(join(rootDir, outputFile), output, 'utf-8')
  console.log(`✓ Created ${outputFile}`)
}

async function main() {
  try {
    // Generate file list
    await generateFileList()
    
    // Concatenate src files
    await concatenateTsFiles(join(rootDir, 'src'), 'file_dump_src.ts')
    
    // Concatenate test files (excluding fixtures)
    await concatenateTsFiles(
      join(rootDir, 'tests'),
      'file_dump_test.ts',
      ['__fixtures__', 'fixtures']
    )
    
    console.log('\n✓ All files generated successfully!')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()

