---
title: UniversalBuffer
sidebar_label: UniversalBuffer
---

# UniversalBuffer

`UniversalBuffer` is a cross-platform Buffer polyfill that works in both Node.js and browser environments. It extends `Uint8Array` to provide Buffer-like functionality while ensuring compatibility across all platforms.

## Why UniversalBuffer?

Universal-git aims to work in both Node.js and browsers. Node.js has a native `Buffer` class, but browsers don't. `UniversalBuffer` provides a unified API that works everywhere:

- **Node.js**: Works alongside or instead of native Buffer
- **Browser**: Provides Buffer-like functionality using Uint8Array
- **Type-safe**: Full TypeScript support
- **Compatible**: Drop-in replacement for Buffer in most cases

## Basic Usage

### Creating a UniversalBuffer

```typescript
import { UniversalBuffer } from 'universal-git'

// From a string (UTF-8 by default)
const buf1 = UniversalBuffer.from('Hello, world!')

// From a string with encoding
const buf2 = UniversalBuffer.from('48656c6c6f', 'hex')
const buf3 = UniversalBuffer.from('SGVsbG8=', 'base64')

// From a number array
const buf4 = UniversalBuffer.from([72, 101, 108, 108, 111])

// From another buffer
const buf5 = UniversalBuffer.from(buf1)

// Allocate empty buffer
const buf6 = UniversalBuffer.alloc(1024)

// Allocate with fill value
const buf7 = UniversalBuffer.alloc(10, 0x42) // Filled with 0x42
```

### Converting to String

```typescript
const buf = UniversalBuffer.from('Hello, world!')

// To UTF-8 string (default)
buf.toString() // 'Hello, world!'
buf.toString('utf8') // 'Hello, world!'

// To hex string
buf.toString('hex') // '48656c6c6f2c20776f726c6421'

// To base64 string
buf.toString('base64') // 'SGVsbG8sIHdvcmxkIQ=='

// To ASCII string
buf.toString('ascii') // 'Hello, world!'

// To Latin1 string
buf.toString('latin1') // 'Hello, world!'
```

### Writing to Buffer

```typescript
const buf = UniversalBuffer.alloc(20)

// Write string at offset
buf.write('Hello', 0, 'utf8')
buf.write('World', 6, 'utf8')

// Write with encoding
buf.write('48656c6c6f', 0, 'hex')
```

### Reading from Buffer

```typescript
const buf = UniversalBuffer.from('Hello, world!')

// Read unsigned integers (big-endian)
const byte = buf.readUInt8(0) // 72
const uint16 = buf.readUInt16BE(0) // 25928
const uint32 = buf.readUInt32BE(0) // 1819043144

// Write unsigned integers (big-endian)
buf.writeUInt8(72, 0)
buf.writeUInt16BE(25928, 0)
buf.writeUInt32BE(1819043144, 0)
```

## API Reference

### Static Methods

#### `UniversalBuffer.from(input, encoding?)`

Creates a `UniversalBuffer` from various input types.

**Parameters:**
- `input`: `string | Uint8Array | ArrayBuffer | number[] | UniversalBuffer | Buffer | null | undefined`
- `encoding?`: `'utf8' | 'hex' | 'ascii' | 'latin1' | 'base64'` (optional)

**Returns:** `UniversalBuffer`

**Special behavior:**
- If `input` is `null` or `undefined`, returns an empty buffer
- If `input` is already a `UniversalBuffer`, returns it unchanged
- If `input` is a Node.js `Buffer`, converts it to `UniversalBuffer`

**Examples:**
```typescript
UniversalBuffer.from('hello') // UTF-8 string
UniversalBuffer.from('68656c6c6f', 'hex') // Hex string
UniversalBuffer.from(null) // Empty buffer
UniversalBuffer.from(undefined) // Empty buffer
```

#### `UniversalBuffer.alloc(size, fill?, encoding?)`

Allocates a new `UniversalBuffer` of the specified size.

**Parameters:**
- `size`: `number` - Size in bytes
- `fill?`: `number | string` - Fill value (default: 0)
- `encoding?`: `BufferEncoding` - Encoding for string fill (default: 'utf8')

**Returns:** `UniversalBuffer`

**Examples:**
```typescript
UniversalBuffer.alloc(10) // 10 bytes filled with 0
UniversalBuffer.alloc(10, 0x42) // 10 bytes filled with 0x42
UniversalBuffer.alloc(10, 'A', 'utf8') // 10 bytes filled with 'A'
```

#### `UniversalBuffer.isBuffer(value)`

Checks if a value is a `UniversalBuffer` or Node.js `Buffer`.

**Parameters:**
- `value`: `any`

**Returns:** `boolean`

**Examples:**
```typescript
UniversalBuffer.isBuffer(UniversalBuffer.from('hello')) // true
UniversalBuffer.isBuffer(Buffer.from('hello')) // true (Node.js only)
UniversalBuffer.isBuffer('hello') // false
```

#### `UniversalBuffer.createStream(buffers)`

Creates an async iterable stream from an array of buffers.

**Parameters:**
- `buffers`: `Array<UniversalBuffer | Uint8Array | Buffer>`

**Returns:** `AsyncIterableIterator<UniversalBuffer>`

**Example:**
```typescript
const buffers = [
  UniversalBuffer.from('Hello'),
  UniversalBuffer.from(' '),
  UniversalBuffer.from('World')
]

for await (const chunk of UniversalBuffer.createStream(buffers)) {
  console.log(chunk.toString())
}
```

#### `UniversalBuffer.fromNodeStream(stream)`

Converts a Node.js `Readable` stream to an async iterable.

**Parameters:**
- `stream`: `NodeJS.ReadableStream`

**Returns:** `AsyncIterableIterator<UniversalBuffer>`

**Example:**
```typescript
import { createReadStream } from 'fs'

const stream = createReadStream('file.txt')
for await (const chunk of UniversalBuffer.fromNodeStream(stream)) {
  console.log(chunk.toString())
}
```

### Instance Methods

#### `buffer.toString(encoding?)`

Converts the buffer to a string.

**Parameters:**
- `encoding?`: `'utf8' | 'hex' | 'ascii' | 'latin1' | 'base64'` (default: 'utf8')

**Returns:** `string`

#### `buffer.write(string, offset?, length?, encoding?)`

Writes a string to the buffer.

**Parameters:**
- `string`: `string` - String to write
- `offset?`: `number` - Byte offset (default: 0)
- `length?`: `number` - Number of bytes to write
- `encoding?`: `BufferEncoding` - Encoding (default: 'utf8')

**Returns:** `number` - Number of bytes written

#### `buffer.copy(target, targetStart?, sourceStart?, sourceEnd?)`

Copies data from this buffer to another buffer.

**Parameters:**
- `target`: `UniversalBuffer | Uint8Array` - Target buffer
- `targetStart?`: `number` - Target offset (default: 0)
- `sourceStart?`: `number` - Source offset (default: 0)
- `sourceEnd?`: `number` - Source end (default: buffer.length)

**Returns:** `number` - Number of bytes copied

#### `buffer.equals(other)`

Compares two buffers byte-by-byte.

**Parameters:**
- `other`: `UniversalBuffer | Uint8Array | Buffer`

**Returns:** `boolean`

#### `buffer.indexOf(value, byteOffset?)`

Finds the index of a value in the buffer.

**Parameters:**
- `value`: `number | string | UniversalBuffer | Uint8Array | Buffer`
- `byteOffset?`: `number` - Starting offset (default: 0)

**Returns:** `number` - Index of value, or -1 if not found

#### `buffer.slice(start?, end?)`

Returns a new buffer that references the same memory.

**Parameters:**
- `start?`: `number` - Start offset (default: 0)
- `end?`: `number` - End offset (default: buffer.length)

**Returns:** `UniversalBuffer`

**Note:** Returns `UniversalBuffer` (not `Uint8Array`) for consistency.

## Migration from Node.js Buffer

### Basic Migration

Most code using Node.js `Buffer` can be migrated by replacing `Buffer` with `UniversalBuffer`:

```typescript
// Before (Node.js only)
import { Buffer } from 'buffer'
const buf = Buffer.from('hello', 'utf8')

// After (cross-platform)
import { UniversalBuffer } from 'universal-git'
const buf = UniversalBuffer.from('hello', 'utf8')
```

### Key Differences

1. **Null/undefined handling**: `UniversalBuffer.from(null)` returns an empty buffer (Node.js Buffer throws)
2. **Type checking**: Use `UniversalBuffer.isBuffer()` instead of `Buffer.isBuffer()`
3. **Stream creation**: Use `UniversalBuffer.createStream()` for async iterables
4. **Node.js streams**: Use `UniversalBuffer.fromNodeStream()` to convert Node.js streams

### Deprecated Methods

- `UniversalBuffer.bufferFrom()` - **Deprecated**. Use `UniversalBuffer.from()` instead.
- `UniversalBuffer.createAsyncIterator()` - **Deprecated**. Use `UniversalBuffer.createStream()` instead.

## Browser Compatibility

`UniversalBuffer` works in all modern browsers that support `Uint8Array`:

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Node.js: ✅ Full support (works alongside native Buffer)

## Performance Considerations

- **Memory**: `UniversalBuffer` uses the same memory layout as `Uint8Array`
- **Speed**: Performance is similar to `Uint8Array` (slightly slower than native Buffer in Node.js)
- **Size**: Minimal overhead compared to `Uint8Array`

## Type Safety

`UniversalBuffer` is fully typed with TypeScript:

```typescript
import { UniversalBuffer } from 'universal-git'

// Type-safe operations
const buf: UniversalBuffer = UniversalBuffer.from('hello')
const str: string = buf.toString('utf8')
const isBuffer: boolean = UniversalBuffer.isBuffer(buf)
```

## See Also

- [Cache Parameter](./cache.md) - Using cache with UniversalBuffer
- [File System Client](./fs.md) - File operations with buffers
- [HTTP Client](./http.md) - Network operations with buffers

