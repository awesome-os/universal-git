#!/usr/bin/env node
/**
 * Analyze CPU profile to find hot paths
 * 
 * Usage:
 *   node performance/analyze-hot-path.mjs [cpuprofile-file]
 * 
 * This script reads a .cpuprofile file and identifies the hottest functions.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const profileFile = process.argv[2] || 'performance/results/merge-add-remove-heatmap-*.cpuprofile'

// Find the most recent profile file if wildcard is used
let profilePath = profileFile
if (profileFile.includes('*')) {
  const { readdirSync } = await import('fs')
  const { dirname, basename } = await import('path')
  const dir = dirname(profileFile)
  const pattern = basename(profileFile).replace('*', '')
  const files = readdirSync(dir)
    .filter(f => f.includes(pattern) && f.endsWith('.cpuprofile'))
    .sort()
    .reverse()
  
  if (files.length === 0) {
    console.error('❌ No profile files found. Run profile-heatmap.mjs first.')
    process.exit(1)
  }
  
  profilePath = join(dir, files[0])
  console.log(`📁 Using profile: ${profilePath}\n`)
}

try {
  const profile = JSON.parse(readFileSync(profilePath, 'utf-8'))
  
  // Build a map of function call times
  const functionTimes = new Map()
  const functionCounts = new Map()
  
  // Process samples to find hot functions
  // CPU profile format: { nodes: [...], samples: [...], timeDeltas: [...] }
  if (profile.nodes && profile.samples) {
    let totalTime = 0
    
    // Build node map for quick lookup
    const nodeMap = new Map()
    profile.nodes.forEach((node, index) => {
      nodeMap.set(index, node)
    })
    
    // Process samples
    for (let i = 0; i < profile.samples.length; i++) {
      const nodeId = profile.samples[i]
      const timeDelta = profile.timeDeltas && profile.timeDeltas[i] ? profile.timeDeltas[i] : 1
      totalTime += timeDelta
      
      // Walk up the call stack
      let currentNode = nodeMap.get(nodeId)
      while (currentNode) {
        const funcName = currentNode.callFrame?.functionName || currentNode.callFrame?.name || '(anonymous)'
        const url = currentNode.callFrame?.url || ''
        const line = currentNode.callFrame?.lineNumber
        const location = line ? `${funcName} (${url}:${line})` : funcName
        
        // Accumulate time
        functionTimes.set(location, (functionTimes.get(location) || 0) + timeDelta)
        functionCounts.set(location, (functionCounts.get(location) || 0) + 1)
        
        // Move to parent
        currentNode = currentNode.parent ? nodeMap.get(currentNode.parent) : null
      }
    }
    
    // Sort by time spent
    const sortedFunctions = Array.from(functionTimes.entries())
      .map(([name, time]) => ({
        name,
        time,
        count: functionCounts.get(name),
        percentage: (time / totalTime * 100).toFixed(2)
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 20) // Top 20
    
    console.log('🔥 Hot Path Analysis')
    console.log('=' .repeat(80))
    console.log(`Total samples: ${profile.samples.length}`)
    console.log(`Total time: ${(totalTime / 1000).toFixed(2)}ms`)
    console.log('')
    console.log('Top 20 Functions by Time Spent:')
    console.log('-' .repeat(80))
    console.log('Time (ms)  | Calls  | % Total | Function')
    console.log('-' .repeat(80))
    
    sortedFunctions.forEach(({ name, time, count, percentage }) => {
      const timeMs = (time / 1000).toFixed(2)
      const countStr = count?.toString().padStart(6) || 'N/A'
      const pctStr = percentage.padStart(6)
      const nameStr = name.length > 50 ? name.substring(0, 47) + '...' : name
      console.log(`${timeMs.padStart(9)} | ${countStr} | ${pctStr}% | ${nameStr}`)
    })
    
    console.log('')
    console.log('💡 Recommendations:')
    const topFunction = sortedFunctions[0]
    if (topFunction) {
      console.log(`   - Focus on: ${topFunction.name}`)
      console.log(`   - This function takes ${topFunction.percentage}% of total time`)
      if (topFunction.count && topFunction.count > 100) {
        console.log(`   - Called ${topFunction.count} times - consider caching or batching`)
      }
    }
  } else {
    console.log('⚠️  Profile format not recognized. Use Chrome DevTools to view the profile.')
  }
} catch (error) {
  console.error('❌ Error reading profile:', error.message)
  console.error('   Make sure you have a valid .cpuprofile file')
  process.exit(1)
}

