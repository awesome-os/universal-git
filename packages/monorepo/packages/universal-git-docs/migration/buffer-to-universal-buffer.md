---
title: Buffer to UniversalBuffer Migration
sidebar_label: Buffer Migration
---

# Migrating from Node.js Buffer to UniversalBuffer

This guide explains how to migrate code from Node.js `Buffer` to `UniversalBuffer` for cross-platform compatibility.

## Why Migrate?

`UniversalBuffer` provides:
- **Cross-platform compatibility**: Works in Node.js and browsers
- **Type safety**: Full TypeScript support
- **Consistent API**: Same methods as Buffer
- **Better null handling**: Handles null/undefined gracefully

## Basic Migration

### Replace Buffer with UniversalBuffer

```typescript
// Before (Node.js only)
import { Buffer } from 'buffer'
const buf = Buffer.from('hello', 'utf8')

// After (cross-platform)
import { UniversalBuffer } from 'universal-git'
const buf = UniversalBuffer.from('hello', 'utf8')
```

### Static Methods

```typescript
// Buffer.from() → UniversalBuffer.from()
const buf1 = UniversalBuffer.from('hello')
const buf2 = UniversalBuffer.from('48656c6c6f', 'hex')
const buf3 = UniversalBuffer.from([72, 101, 108, 108, 111])

// Buffer.alloc() → UniversalBuffer.alloc()
const buf4 = UniversalBuffer.alloc(1024)
const buf5 = UniversalBuffer.alloc(10, 0x42)

// Buffer.isBuffer() → UniversalBuffer.isBuffer()
if (UniversalBuffer.isBuffer(data)) {
  // Handle buffer
}

// Buffer.concat() → UniversalBuffer.concat()
const combined = UniversalBuffer.concat([buf1, buf2, buf3])
```

### Instance Methods

Most instance methods work the same:

```typescript
const buf = UniversalBuffer.from('Hello, world!')

// toString() - same API
buf.toString('utf8')
buf.toString('hex')
buf.toString('base64')

// write() - same API
buf.write('test', 0, 'utf8')

// read/write numbers - same API
buf.readUInt8(0)
buf.writeUInt8(42, 0)

// copy() - same API
const target = UniversalBuffer.alloc(20)
buf.copy(target)

// indexOf() - same API
buf.indexOf('world')

// slice() - returns UniversalBuffer (not Uint8Array)
const sliced = buf.slice(0, 5)
```

## Key Differences

### 1. Null/Undefined Handling

```typescript
// Node.js Buffer throws on null/undefined
Buffer.from(null)  // ❌ Throws error

// UniversalBuffer returns empty buffer
UniversalBuffer.from(null)  // ✅ Returns empty UniversalBuffer
UniversalBuffer.from(undefined)  // ✅ Returns empty UniversalBuffer
```

### 2. Type Checking

```typescript
// Use UniversalBuffer.isBuffer() instead of Buffer.isBuffer()
if (UniversalBuffer.isBuffer(data)) {
  // Handle buffer
}
```

### 3. Stream Creation

```typescript
// UniversalBuffer provides stream creation helpers
const stream = UniversalBuffer.createStream(asyncIterable)
const nodeStream = UniversalBuffer.fromNodeStream(readableStream)
```

### 4. Return Types

```typescript
// slice() returns UniversalBuffer (not Uint8Array)
const buf = UniversalBuffer.from('hello')
const sliced = buf.slice(0, 3)  // Returns UniversalBuffer
```

## Migration Patterns

### Pattern 1: Simple Replacement

```typescript
// Before
import { Buffer } from 'buffer'
const data = Buffer.from('content')

// After
import { UniversalBuffer } from 'universal-git'
const data = UniversalBuffer.from('content')
```

### Pattern 2: Type Annotations

```typescript
// Before
function process(data: Buffer): Buffer {
  return Buffer.from(data)
}

// After
import { UniversalBuffer } from 'universal-git'
function process(data: UniversalBuffer): UniversalBuffer {
  return UniversalBuffer.from(data)
}
```

### Pattern 3: Async Iterables

```typescript
// Before
async function collect(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// After
import { UniversalBuffer } from 'universal-git'
async function collect(stream: AsyncIterable<UniversalBuffer>): Promise<UniversalBuffer> {
  const chunks: UniversalBuffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return UniversalBuffer.concat(chunks)
}
```

### Pattern 4: Node.js Streams

```typescript
// Before
import { Readable } from 'stream'
const buffer = Buffer.from(await collect(stream))

// After
import { UniversalBuffer } from 'universal-git'
const buffer = UniversalBuffer.fromNodeStream(stream)
// Or use createStream for async iterables
const buffer = await UniversalBuffer.createStream(stream)
```

## Common Migration Scenarios

### Scenario 1: File Reading

```typescript
// Before
const content = await fs.readFile('file.txt')
const buffer = Buffer.from(content)

// After
import { UniversalBuffer } from 'universal-git'
const content = await fs.read('file.txt')
const buffer = UniversalBuffer.from(content as string | Uint8Array)
```

### Scenario 2: String Encoding

```typescript
// Before
const hex = Buffer.from('hello').toString('hex')
const base64 = Buffer.from('hello').toString('base64')

// After
import { UniversalBuffer } from 'universal-git'
const hex = UniversalBuffer.from('hello').toString('hex')
const base64 = UniversalBuffer.from('hello').toString('base64')
```

### Scenario 3: Binary Data

```typescript
// Before
const data = Buffer.alloc(1024)
data.writeUInt32BE(12345, 0)

// After
import { UniversalBuffer } from 'universal-git'
const data = UniversalBuffer.alloc(1024)
data.writeUInt32BE(12345, 0)
```

## Breaking Changes

### 1. Null Handling

```typescript
// ⚠️ Breaking: UniversalBuffer.from(null) returns empty buffer
// Node.js Buffer.from(null) throws error
const buf = UniversalBuffer.from(null)  // Empty buffer, not error
```

### 2. Type Compatibility

```typescript
// ⚠️ UniversalBuffer extends Uint8Array, not Node.js Buffer
// Some type checks may need updates
if (data instanceof UniversalBuffer) {
  // Handle UniversalBuffer
}
```

### 3. Global Buffer

```typescript
// ⚠️ UniversalBuffer is not available as global Buffer
// Must import explicitly
import { UniversalBuffer } from 'universal-git'
```

## Best Practices

### 1. Import Explicitly

```typescript
// ✅ Good: Explicit import
import { UniversalBuffer } from 'universal-git'

// ⚠️ Avoid: Relying on global Buffer
// const buf = Buffer.from('hello')  // May not work in browser
```

### 2. Use Type Guards

```typescript
// ✅ Good: Use isBuffer() for type checking
if (UniversalBuffer.isBuffer(data)) {
  // TypeScript knows data is UniversalBuffer
}
```

### 3. Handle Null Safely

```typescript
// ✅ Good: UniversalBuffer handles null gracefully
const buf = UniversalBuffer.from(maybeNull)  // Safe, returns empty buffer

// ⚠️ If you need to preserve null behavior:
const buf = maybeNull ? UniversalBuffer.from(maybeNull) : null
```

## Compatibility Notes

### Node.js Compatibility

- UniversalBuffer works alongside Node.js Buffer
- Can convert between them: `UniversalBuffer.from(nodeBuffer)`
- Most Buffer methods are implemented

### Browser Compatibility

- UniversalBuffer works in all modern browsers
- No polyfills required
- Full feature parity with Buffer API

## See Also

- [UniversalBuffer Documentation](../universal-buffer.md) - Complete API reference
- [Type Error Reduction Plan](../../plans/TYPE_ERROR_REDUCTION_PLAN.md) - Migration details





