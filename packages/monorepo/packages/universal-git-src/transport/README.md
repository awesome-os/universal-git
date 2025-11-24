# UniversalTransport Layer

The UniversalTransport layer provides a swappable abstraction for worker communication that can be used in the Orchestrator and above layers.

## Overview

This layer allows you to swap different transport mechanisms without changing higher-level code. It supports:

- **LocalTransport**: Simple in-process transport (default, no dependencies)
- **BroadcastChannelTransport**: Multi-worker broadcast communication
- **MessageChannelTransport**: Point-to-point communication

## Usage

### Basic Usage

```typescript
import { createTransport, createDefaultTransport } from '@awesome-os/universal-git-src/transport'

// Use local transport (default, simplest)
const transport = createDefaultTransport('my-app')

// Or specify transport type
const broadcastTransport = createTransport({
  type: 'broadcast-channel',
  name: 'git-workers'
})

// Use with workers
import { WorkerPool } from '@awesome-os/universal-git-src/workers'
const pool = new WorkerPool(4, './worker.js', transport)
```

### Transport Types

#### LocalTransport

Simple in-memory transport for single-threaded or same-process communication. No dependencies required.

```typescript
const transport = createTransport({ type: 'local', name: 'my-transport' })
```

**Pros:**
- ✅ Simple, no dependencies
- ✅ Works in single-threaded environments
- ✅ Good for testing

**Cons:**
- ❌ Limited to same process

#### BroadcastChannelTransport

Works across multiple workers and main thread using BroadcastChannel API.

```typescript
const transport = createTransport({
  type: 'broadcast-channel',
  name: 'git-workers'
})
```

**Pros:**
- ✅ Works across multiple workers
- ✅ Browser and Node.js support (with polyfill)
- ✅ Good for multi-worker coordination

**Cons:**
- ❌ Requires BroadcastChannel polyfill in Node.js

#### MessageChannelTransport

Point-to-point communication between main thread and worker.

```typescript
const channel = new MessageChannel()
const transport = createTransport({
  type: 'message-channel',
  channel: channel.port1
})
```

**Pros:**
- ✅ Point-to-point communication
- ✅ Native browser/Node.js support
- ✅ Good for dedicated worker connections

**Cons:**
- ❌ One channel per worker pair

## Integration with Workers

```typescript
import { WorkerPool } from '@awesome-os/universal-git-src/workers'
import { createDefaultTransport } from '@awesome-os/universal-git-src/transport'

// Create transport
const transport = createDefaultTransport('git-workers')

// Create worker pool with transport
const pool = new WorkerPool(4, './worker.js', transport)

// Broadcast message to all workers
pool.broadcast({ type: 'config-update', config: newConfig })
```

## Integration with Repository

```typescript
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository'
import { createDefaultTransport } from '@awesome-os/universal-git-src/transport'

const repo = await Repository.open({ fs, dir })

// Enable workers with transport
repo.enableWorkers(createDefaultTransport('git-repo'))
```

## API Reference

### `createTransport(options: TransportOptions): Transport`

Creates a transport instance based on the provided options.

### `createDefaultTransport(name?: string): Transport`

Creates a LocalTransport instance (simplest, no dependencies).

### `Transport` Interface

```typescript
interface Transport {
  send(message: unknown, targetId?: string): void
  onMessage(handler: (message: unknown, sourceId?: string) => void): () => void
  getType(): TransportType
  close(): void
}
```

## Examples

See the main plan document for more detailed examples and integration patterns.

