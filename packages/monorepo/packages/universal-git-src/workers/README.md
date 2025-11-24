# Worker Infrastructure

Worker thread support for universal-git using Comlink and UniversalTransport.

## Overview

This module provides worker thread infrastructure that allows git operations to run in separate threads, keeping the main thread unblocked.

## Architecture

- **ComlinkWorker**: Wrapper around Comlink that handles worker creation and lifecycle
- **WorkerPool**: Manages a pool of worker threads
- **GitWorkerImpl**: Implementation of git operations in worker threads
- **Proxies**: Type definitions for proxied Repository and Backends

## Usage

### Basic Usage with Repository

```typescript
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository'
import { createDefaultTransport } from '@awesome-os/universal-git-src/transport'
import * as fs from 'fs'

// Open repository
const repo = await Repository.open({ fs, dir: './my-repo' })

// Enable workers with default transport (LocalTransport)
repo.enableWorkers()

// Or with custom transport
import { createTransport } from '@awesome-os/universal-git-src/transport'
repo.enableWorkers(createTransport({ type: 'broadcast-channel', name: 'git-workers' }))

// Now operations can run in worker threads
// The Repository will automatically use workers when available
```

### Direct Worker Pool Usage

```typescript
import { WorkerPool } from '@awesome-os/universal-git-src/workers'
import { createDefaultTransport } from '@awesome-os/universal-git-src/transport'

// Create transport
const transport = createDefaultTransport('git-workers')

// Create worker pool
const pool = new WorkerPool(4, './workers/git-worker.js', transport)

// Acquire a worker
const worker = await pool.acquire()

try {
  // Create a Repository in the worker
  const proxiedRepo = await worker.call('createRepository', {
    fs: myFs,
    dir: './my-repo',
  })
  
  // Use the proxied repository (all operations run in worker thread)
  await proxiedRepo.checkout('main')
} finally {
  pool.release(worker)
}
```

### Worker Script

The worker script (`git-worker.ts`) needs to be compiled and available at runtime. Make sure your build process includes it.

## API Reference

### `ComlinkWorker`

Wrapper around Comlink for worker communication.

```typescript
const worker = new ComlinkWorker('./worker.js', transport)
const repo = await worker.call('createRepository', options)
```

### `WorkerPool`

Manages a pool of worker threads.

```typescript
const pool = new WorkerPool(maxWorkers, workerScript, transport)
const worker = await pool.acquire()
// ... use worker
pool.release(worker)
```

### `GitWorkerAPI`

Interface for worker operations:

- `createRepository(options)`: Create Repository in worker
- `createGitBackend(options)`: Create GitBackend in worker
- `createGitWorktreeBackend(options)`: Create GitWorktreeBackend in worker
- `ping()`: Health check

## Transport Integration

Workers use the UniversalTransport layer for coordination. See `../transport/README.md` for transport options.

## Notes

- Workers require Node.js `worker_threads` or browser `WebWorker` support
- Filesystem access in workers requires special handling (proxied via Comlink)
- The worker script must be compiled and available at the specified path

