#!/usr/bin/env node
/**
 * Worker Thread Example
 * 
 * Demonstrates how to use worker threads with universal-git
 */

import 'dotenv/config.js'
import * as fs from 'fs'
import path from 'path'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import { createDefaultTransport, createTransport } from '@awesome-os/universal-git-src/transport/index.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/git/backends/GitBackendFs/utils/createFileSystem.ts'

async function main() {
  console.log('🚀 Worker Thread Example\n')

  // Create filesystem
  const nodeFs = createFileSystem(fs as any)
  
  // Open repository
  const repoDir = path.join(process.cwd(), '.git')
  const repo = await Repository.open({
    fs: nodeFs,
    dir: process.cwd(),
    gitdir: repoDir,
  })

  console.log('✅ Repository opened')

  // Example 1: Enable workers with default transport (LocalTransport)
  console.log('\n📦 Enabling workers with default transport...')
  repo.enableWorkers()
  console.log('✅ Workers enabled with LocalTransport')

  // Check if workers are enabled
  if (repo.hasWorkers()) {
    console.log('✅ Workers are active')
    const transport = repo.getTransport()
    if (transport) {
      console.log(`   Transport type: ${transport.getType()}`)
    }
  }

  // Example 2: Enable workers with BroadcastChannel transport
  // Uncomment to use BroadcastChannel instead:
  /*
  console.log('\n📦 Enabling workers with BroadcastChannel transport...')
  repo.enableWorkers(createTransport({
    type: 'broadcast-channel',
    name: 'git-workers'
  }))
  console.log('✅ Workers enabled with BroadcastChannel')
  */

  // Example 3: Get proxied repository for worker execution
  console.log('\n🔄 Getting proxied repository...')
  try {
    const proxiedRepo = await repo.getProxiedRepository()
    if (proxiedRepo) {
      console.log('✅ Proxied repository created in worker thread')
      console.log('   All operations on this repository will run in worker thread')
    } else {
      console.log('⚠️  Could not create proxied repository (workers may not be properly initialized)')
    }
  } catch (error) {
    console.log('⚠️  Note: Worker script may not be available in this environment')
    console.log(`   Error: ${(error as Error).message}`)
  }

  // Example 4: Broadcast message to workers
  console.log('\n📡 Broadcasting message to workers...')
  repo.broadcastToWorkers({ type: 'config-update', message: 'Hello from main thread!' })
  console.log('✅ Message broadcasted')

  // Cleanup
  console.log('\n🧹 Cleaning up...')
  await repo.cleanupWorkers()
  console.log('✅ Cleanup complete')

  console.log('\n✨ Example complete!')
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

