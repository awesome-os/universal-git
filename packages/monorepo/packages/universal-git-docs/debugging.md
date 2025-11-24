---
title: Debug Logging
sidebar_label: Debugging
---

# Debug Logging

Universal-git provides comprehensive debug logging capabilities to help diagnose issues during development. All verbose instrumentation is gated behind environment variables, so it doesn't affect production performance.

## Environment Variables

Debug logging is controlled by environment variables. Each flag defaults to `0` (disabled) and can be enabled by setting it to `1`.

| Flag | What it traces |
|------|---------------|
| `UNIVERSAL_GIT_DEBUG_HTTP` / `ISOGIT_DEBUG_HTTP` / `ISO_GIT_DEBUG_HTTP` | HTTP request/response lifecycle (headers, socket assignment, stall detection) |
| `UNIVERSAL_GIT_DEBUG_STREAMS` / `ISOGIT_DEBUG_STREAMS` / `ISO_GIT_DEBUG_STREAMS` | `collect()` chunk counts and byte totals |
| `UNIVERSAL_GIT_DEBUG_SIDE_BAND` / `ISOGIT_DEBUG_SIDE_BAND` / `ISO_GIT_DEBUG_SIDE_BAND` | Side-band demux (pkt-line channels, payload sizes) |
| `UNIVERSAL_GIT_DEBUG_PKT_LINE` / `ISOGIT_DEBUG_PKT_LINE` / `ISO_GIT_DEBUG_PKT_LINE` | pkt-line reader events (length parsing, EOF conditions) |
| `UNIVERSAL_GIT_DEBUG_STREAM_READER` / `ISOGIT_DEBUG_STREAM_READER` / `ISO_GIT_DEBUG_STREAM_READER` | Low-level `StreamReader` buffer management |

**Note**: Multiple flag names are supported for backward compatibility (`UNIVERSAL_GIT_DEBUG_*`, `ISOGIT_DEBUG_*`, `ISO_GIT_DEBUG_*`).

## Enabling Debug Logging

### Method 1: Environment Variables (Node.js)

```bash
# Enable HTTP debugging
export UNIVERSAL_GIT_DEBUG_HTTP=1

# Enable multiple flags
export UNIVERSAL_GIT_DEBUG_HTTP=1
export UNIVERSAL_GIT_DEBUG_STREAMS=1
export UNIVERSAL_GIT_DEBUG_SIDE_BAND=1

# Run your script
node your-script.js
```

### Method 2: .env File (Recommended)

Create a `.env` file in your project root:

```env
# .env
UNIVERSAL_GIT_DEBUG_HTTP=1
UNIVERSAL_GIT_DEBUG_STREAMS=1
UNIVERSAL_GIT_DEBUG_SIDE_BAND=1
UNIVERSAL_GIT_DEBUG_PKT_LINE=0
UNIVERSAL_GIT_DEBUG_STREAM_READER=0
```

Then import `dotenv/config.js` at the top of your script:

```typescript
import 'dotenv/config.js'
import { clone } from 'universal-git'

// Debug flags are now loaded from .env
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git'
})
```

### Method 3: PowerShell (Windows)

```powershell
# Set environment variable
$env:UNIVERSAL_GIT_DEBUG_HTTP = '1'
$env:UNIVERSAL_GIT_DEBUG_STREAMS = '1'

# Run your script
node your-script.js
```

### Method 4: Inline (One-off)

```typescript
// Set before importing universal-git
process.env.UNIVERSAL_GIT_DEBUG_HTTP = '1'
process.env.UNIVERSAL_GIT_DEBUG_STREAMS = '1'

import { clone } from 'universal-git'
// ... rest of your code
```

## What Each Flag Does

### HTTP Debugging (`UNIVERSAL_GIT_DEBUG_HTTP`)

Traces HTTP request/response lifecycle:

```
[HTTP] Request: GET https://github.com/user/repo.git/info/refs?service=git-upload-pack
[HTTP] Headers: { 'user-agent': '...', 'accept': '...' }
[HTTP] Response: 200 OK
[HTTP] Headers: { 'content-type': '...', 'content-length': '...' }
[HTTP] Socket assigned
[HTTP] Stall detected: 5000ms
```

**Use when:**
- Debugging network issues
- Understanding HTTP protocol flow
- Diagnosing authentication problems
- Checking request/response headers

### Streams Debugging (`UNIVERSAL_GIT_DEBUG_STREAMS`)

Traces stream collection operations:

```
[STREAMS] collect() started
[STREAMS] Chunk 1: 1024 bytes
[STREAMS] Chunk 2: 2048 bytes
[STREAMS] Total: 3072 bytes, 2 chunks
[STREAMS] collect() completed
```

**Use when:**
- Debugging data collection
- Understanding stream flow
- Diagnosing memory issues
- Checking chunk sizes

### Side-Band Debugging (`UNIVERSAL_GIT_DEBUG_SIDE_BAND`)

Traces side-band demultiplexing:

```
[SIDE-BAND] Channel 1 (pack data): 1024 bytes
[SIDE-BAND] Channel 2 (progress): "Counting objects: 100"
[SIDE-BAND] Channel 3 (error): "warning: ..."
[SIDE-BAND] Flush packet received
```

**Use when:**
- Debugging Git protocol side-band
- Understanding progress messages
- Diagnosing protocol errors
- Checking channel separation

### Packet Line Debugging (`UNIVERSAL_GIT_DEBUG_PKT_LINE`)

Traces pkt-line parsing:

```
[PKT-LINE] Reading length: 0010
[PKT-LINE] Payload: "0000" (flush)
[PKT-LINE] Reading length: 0045
[PKT-LINE] Payload: "refs/heads/main abc123..."
[PKT-LINE] EOF detected
```

**Use when:**
- Debugging Git protocol parsing
- Understanding pkt-line format
- Diagnosing protocol errors
- Checking packet boundaries

### Stream Reader Debugging (`UNIVERSAL_GIT_DEBUG_STREAM_READER`)

Traces low-level buffer management:

```
[STREAM-READER] Buffer size: 8192 bytes
[STREAM-READER] Cursor: 0
[STREAM-READER] Reading 1024 bytes
[STREAM-READER] Buffer exhausted, refilling
[STREAM-READER] New buffer: 8192 bytes
```

**Use when:**
- Debugging buffer management
- Understanding stream reading
- Diagnosing memory issues
- Checking buffer boundaries

## Production Builds

For production builds, you typically want to tree-shake away `dotenv/config.js` to keep bundles small.

### Webpack Configuration

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      'dotenv/config.js': path.resolve(__dirname, 'scripts/dotenv-noop.js')
    }
  }
}
```

Create `scripts/dotenv-noop.js`:

```javascript
// dotenv-noop.js - No-op module for production
export {}
```

### Vite Configuration

```javascript
// vite.config.js
export default {
  resolve: {
    alias: {
      'dotenv/config.js': path.resolve(__dirname, 'scripts/dotenv-noop.js')
    }
  }
}
```

### Rollup Configuration

```javascript
// rollup.config.js
export default {
  plugins: [
    alias({
      entries: [
        { find: 'dotenv/config.js', replacement: path.resolve(__dirname, 'scripts/dotenv-noop.js') }
      ]
    })
  ]
}
```

This keeps development ergonomics (debug toggles via `.env`) while producing lean production bundles.

## Example: Debugging Clone Operation

```typescript
import 'dotenv/config.js'
import { clone } from 'universal-git'
import * as fs from 'fs'

// .env file:
// UNIVERSAL_GIT_DEBUG_HTTP=1
// UNIVERSAL_GIT_DEBUG_STREAMS=1
// UNIVERSAL_GIT_DEBUG_SIDE_BAND=1

await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  onProgress: (progress) => {
    console.log('Progress:', progress)
  }
})
```

**Output:**
```
[HTTP] Request: GET https://github.com/user/repo.git/info/refs?service=git-upload-pack
[HTTP] Response: 200 OK
[SIDE-BAND] Channel 2 (progress): "Counting objects: 100"
[STREAMS] Chunk 1: 8192 bytes
[SIDE-BAND] Channel 2 (progress): "Compressing objects: 50%"
[STREAMS] Chunk 2: 16384 bytes
[STREAMS] Total: 24576 bytes, 2 chunks
Progress: { phase: 'fetching', loaded: 24576, total: 100000 }
```

## Best Practices

### 1. Use .env File for Development

```env
# .env (committed to git, defaults to all disabled)
UNIVERSAL_GIT_DEBUG_HTTP=0
UNIVERSAL_GIT_DEBUG_STREAMS=0
UNIVERSAL_GIT_DEBUG_SIDE_BAND=0
UNIVERSAL_GIT_DEBUG_PKT_LINE=0
UNIVERSAL_GIT_DEBUG_STREAM_READER=0
```

```env
# .env.local (not committed, enable as needed)
UNIVERSAL_GIT_DEBUG_HTTP=1
UNIVERSAL_GIT_DEBUG_STREAMS=1
```

### 2. Enable Only What You Need

Don't enable all flags at once - it produces too much output. Enable only the flags relevant to your issue.

### 3. Use Production Aliases

Always alias `dotenv/config.js` to a no-op in production builds to keep bundles small.

### 4. Document Your Debugging

If you're debugging a specific issue, document which flags you used and what output you saw.

## Troubleshooting

### No Debug Output

1. Check that the environment variable is set: `echo $UNIVERSAL_GIT_DEBUG_HTTP`
2. Verify you're importing `dotenv/config.js` before importing universal-git
3. Make sure the flag is set to `'1'` (string), not `1` (number)

### Too Much Output

1. Disable flags you don't need
2. Use more specific flags (e.g., only `UNIVERSAL_GIT_DEBUG_HTTP`)
3. Filter output with `grep` or similar tools

### Production Bundle Size

1. Ensure `dotenv/config.js` is aliased to a no-op
2. Verify the alias is working (check bundle size)
3. Test that production builds work without dotenv

## See Also

- [HTTP Client](./http.md) - HTTP client configuration
- [Protocols](./protocols.md) - Git protocol details
- [Troubleshooting](./faq.md#troubleshooting) - Common issues and solutions

