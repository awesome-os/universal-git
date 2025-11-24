#!/usr/bin/env node
/**
 * Script to regenerate git fixtures with corrected tree sorting
 * 
 * This script reads tree objects from fixtures, re-serializes them with
 * the new compareTreeEntryPath sorting, and updates the objects in place.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import isomorphic-git functions
const ObjectReaderModule = await import('./src/core-utils/odb/ObjectReader.ts')
const ObjectWriterModule = await import('./src/core-utils/odb/ObjectWriter.ts')
const FileSystemModule = await import('@awesome-os/universal-git-src/models/FileSystem.ts')
const TreeParserModule = await import('@awesome-os/universal-git-src/core-utils/parsers/Tree.ts')
const GitObjectModule = await import('@awesome-os/universal-git-src/models/GitObject.ts')

const ObjectReader = ObjectReaderModule.ObjectReader
const ObjectWriter = ObjectWriterModule.ObjectWriter
const FileSystem = FileSystemModule.FileSystem
const parseTree = TreeParserModule.parse
const serializeTree = TreeParserModule.serialize
const GitObject = GitObjectModule.GitObject

// Use new location: tests/__fixtures__/
const fixturesDir = path.join(__dirname, 'tests', '__fixtures__')

/**
 * Recursively find all tree objects in a gitdir and regenerate them
 */
async function regenerateTreeObjects(gitdir) {
  const nodeFs = require('fs')
  const fs = new FileSystem(nodeFs)
  const cache = {}
  const objectsDir = path.join(gitdir, 'objects')
  
  if (!nodeFs.existsSync(objectsDir)) {
    return { fixed: 0, skipped: 0 }
  }
  
  let fixed = 0
  let skipped = 0
  const processed = new Set()
  
  // Get all object subdirectories
  const subdirs = nodeFs.readdirSync(objectsDir).filter(d => 
    /^[0-9a-f]{2}$/.test(d) && nodeFs.statSync(path.join(objectsDir, d)).isDirectory()
  )
  
  for (const subdir of subdirs) {
    const subdirPath = path.join(objectsDir, subdir)
    const files = nodeFs.readdirSync(subdirPath).filter(f => /^[0-9a-f]{38}$/.test(f))
    
    for (const file of files) {
      const oid = subdir + file
      if (processed.has(oid)) continue
      processed.add(oid)
      
      try {
        // Read the deflated object directly from filesystem to bypass SHA check
        const objectPath = path.join(objectsDir, subdir, file)
        const deflated = nodeFs.readFileSync(objectPath)
        
        // Inflate the object
        const { inflate } = await import('@awesome-os/universal-git-src/core-utils/Zlib.ts')
        const inflated = await inflate(deflated)
        const wrapped = Buffer.from(inflated)
        
        // Unwrap to get type and content
        const { object: content, type } = GitObject.unwrap(wrapped)
        
        if (type === 'tree') {
          // Compute SHA of the wrapped object to check if it matches the OID
          const { shasum } = await import('@awesome-os/universal-git-src/core-utils/ShaHasher.ts')
          const computedSha = await shasum(wrapped)
          const shaMismatch = computedSha !== oid
          
          // Parse and re-serialize the tree with new sorting
          const entries = parseTree(content)
          const newBuffer = serializeTree(entries)
          
          // Check if the serialized buffer is different
          const bufferChanged = !content.equals(newBuffer)
          
          // If SHA doesn't match OR buffer changed, regenerate the object
          if (shaMismatch || bufferChanged) {
            // Re-write the object with new serialization
            const newOid = await ObjectWriter.write({
              fs,
              gitdir,
              type: 'tree',
              object: newBuffer,
              format: 'content'
            })
            
            if (shaMismatch) {
              console.log(`  Fixed tree ${oid} (SHA mismatch: computed ${computedSha}) -> ${newOid}`)
            } else {
              console.log(`  Fixed tree ${oid} (buffer changed) -> ${newOid}`)
            }
            fixed++
            
            // Delete old object file
            nodeFs.unlinkSync(objectPath)
            
            // If OID changed, we need to update references
            if (newOid !== oid) {
              await updateReferences(gitdir, oid, newOid, nodeFs)
            }
          } else {
            skipped++
          }
        } else {
          skipped++
        }
      } catch (err) {
        // Not a tree or can't read - skip
        if (err.code !== 'ENOENT' && !err.message?.includes('SHA check failed')) {
          console.warn(`  Warning: ${oid}: ${err.message}`)
        }
        skipped++
      }
    }
  }
  
  return { fixed, skipped }
}

/**
 * Update references that point to old OID to point to new OID
 */
async function updateReferences(gitdir, oldOid, newOid, nodeFs) {
  // Update packed-refs
  const packedRefsPath = path.join(gitdir, 'packed-refs')
  if (nodeFs.existsSync(packedRefsPath)) {
    let content = nodeFs.readFileSync(packedRefsPath, 'utf8')
    content = content.replace(new RegExp(oldOid, 'g'), newOid)
    nodeFs.writeFileSync(packedRefsPath, content, 'utf8')
  }
  
  // Update loose refs
  const refsDir = path.join(gitdir, 'refs')
  if (nodeFs.existsSync(refsDir)) {
    await updateRefsRecursive(refsDir, oldOid, newOid, nodeFs)
  }
  
  // Update HEAD if it's a direct SHA
  const headPath = path.join(gitdir, 'HEAD')
  if (nodeFs.existsSync(headPath)) {
    let headContent = nodeFs.readFileSync(headPath, 'utf8').trim()
    if (headContent === oldOid) {
      nodeFs.writeFileSync(headPath, newOid + '\n', 'utf8')
    }
  }
}

async function updateRefsRecursive(dir, oldOid, newOid, nodeFs) {
  const entries = nodeFs.readdirSync(dir)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry)
    const stat = nodeFs.statSync(entryPath)
    
    if (stat.isDirectory()) {
      await updateRefsRecursive(entryPath, oldOid, newOid, nodeFs)
    } else {
      let content = nodeFs.readFileSync(entryPath, 'utf8').trim()
      if (content === oldOid) {
        nodeFs.writeFileSync(entryPath, newOid + '\n', 'utf8')
      }
    }
  }
}

/**
 * Main function to regenerate all fixtures
 */
async function main() {
  console.log('Regenerating fixtures with new tree sorting...\n')
  
  if (!fs.existsSync(fixturesDir)) {
    console.error(`Fixtures directory not found: ${fixturesDir}`)
    process.exit(1)
  }
  
  const fixtures = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith('.git'))
    .map(f => ({ name: f, path: path.join(fixturesDir, f) }))
  
  console.log(`Found ${fixtures.length} fixture directories\n`)
  
  let totalFixed = 0
  let totalSkipped = 0
  
  for (const fixture of fixtures) {
    console.log(`Processing ${fixture.name}...`)
    try {
      const { fixed, skipped } = await regenerateTreeObjects(fixture.path)
      totalFixed += fixed
      totalSkipped += skipped
      if (fixed > 0) {
        console.log(`  ✓ Fixed ${fixed} tree objects, skipped ${skipped}`)
      } else {
        console.log(`  - No changes needed (${skipped} objects checked)`)
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`)
    }
  }
  
  console.log(`\nDone! Fixed ${totalFixed} tree objects, skipped ${totalSkipped}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

