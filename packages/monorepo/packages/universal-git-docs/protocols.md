# Git Transport Protocols

Universal-git supports all major Git transport protocols for fetching and cloning repositories. This document describes how to use each protocol.

## Supported Protocols

### HTTP/HTTPS (Smart Protocol) ✅

The HTTP smart protocol is the most commonly used protocol and is fully supported.

```javascript
import { clone } from 'universal-git'
import http from 'universal-git/http/node'
import fs from 'fs'

// Clone via HTTPS
await clone({
  fs,
  http,
  dir: './my-repo',
  url: 'https://github.com/user/repo.git'
})

// Clone via HTTP
await clone({
  fs,
  http,
  dir: './my-repo',
  url: 'http://example.com/repo.git'
})
```

**Features**:
- Protocol v1 and v2 support
- Authentication support (via `onAuth` callback)
- CORS proxy support
- Progress reporting

### Git Daemon Protocol (git://) ✅

The Git daemon protocol uses TCP connections on port 9418 (default) and provides read-only access without authentication.

```javascript
import { clone } from 'universal-git'
import { tcpClient } from 'universal-git/daemon/node'
import fs from 'fs'

// Clone via git:// protocol
await clone({
  fs,
  tcp: tcpClient,
  dir: './my-repo',
  url: 'git://example.com/repo.git'
})

// With custom port
await clone({
  fs,
  tcp: tcpClient,
  dir: './my-repo',
  url: 'git://example.com:9419/repo.git'
})
```

**Features**:
- Protocol v1 and v2 support
- No authentication required
- TCP-based (faster for local networks)
- Automatic TCP client detection in Node.js

**Note**: The TCP client is automatically imported in Node.js environments if not provided. For browser environments, a custom TCP client implementation would be required.

### SSH Protocol (ssh://, git@) ✅

The SSH protocol provides authenticated access to Git repositories over SSH.

```javascript
import { clone } from 'universal-git'
import { sshClient } from 'universal-git/ssh/node'
import fs from 'fs'

// Clone via SSH URL
await clone({
  fs,
  ssh: await sshClient,
  dir: './my-repo',
  url: 'ssh://user@example.com/path/to/repo.git'
})

// Clone via SCP-style URL (git@)
await clone({
  fs,
  ssh: await sshClient,
  dir: './my-repo',
  url: 'git@github.com:user/repo.git'
})
```

**Features**:
- Protocol v1 and v2 support
- Key-based authentication
- Password authentication (via ssh2 package)
- Bidirectional communication support

**SSH Client Options**:

The SSH client supports both the `ssh2` npm package (recommended) and a fallback using `child_process` with the system's `ssh` command.

**Using ssh2 package** (recommended):
```bash
npm install ssh2
```

The implementation will automatically use `ssh2` if available, providing better support for:
- In-memory private keys
- Password authentication
- Better error handling
- Proper bidirectional communication

**Using system ssh** (fallback):
If `ssh2` is not available, the implementation falls back to using the system's `ssh` command via `child_process`. This has limitations:
- Private keys must be file paths (not in-memory)
- Password authentication is not secure
- Less robust error handling

### HTTP Dumb Protocol ⚠️

The HTTP dumb protocol is a legacy protocol that serves static files from the `.git` directory. This protocol is partially implemented (class structure created, full implementation pending).

**Status**: Class structure exists, but full implementation (reference discovery, object fetching) is pending.

## Protocol Detection

Universal-git automatically detects the protocol from the URL:

- `http://` or `https://` → HTTP Smart Protocol (with fallback to Dumb if Smart fails)
- `git://` → Git Daemon Protocol
- `ssh://` or `git@` → SSH Protocol

## Fetch Operations

All protocols work with the `fetch` command:

```javascript
import { fetch } from 'universal-git'
import http from 'universal-git/http/node'
import { tcpClient } from 'universal-git/daemon/node'
import { sshClient } from 'universal-git/ssh/node'
import fs from 'fs'

// HTTP
await fetch({
  fs,
  http,
  gitdir: './.git',
  url: 'https://github.com/user/repo.git'
})

// Git Daemon
await fetch({
  fs,
  tcp: tcpClient,
  gitdir: './.git',
  url: 'git://example.com/repo.git'
})

// SSH
await fetch({
  fs,
  ssh: await sshClient,
  gitdir: './.git',
  url: 'ssh://user@example.com/repo.git'
})
```

## Protocol Version Support

All protocols support both Git protocol v1 and v2:

```javascript
// Request protocol v2
await clone({
  fs,
  http,
  dir: './my-repo',
  url: 'https://github.com/user/repo.git',
  protocolVersion: 2  // Request v2 (will fallback to v1 if not supported)
})
```

## Progress Reporting

All protocols support progress reporting:

```javascript
await clone({
  fs,
  http,
  dir: './my-repo',
  url: 'https://github.com/user/repo.git',
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.loaded}/${progress.total}`)
  }
})
```

## Authentication

HTTP and SSH protocols support authentication:

### HTTP Authentication

```javascript
await clone({
  fs,
  http,
  dir: './my-repo',
  url: 'https://github.com/user/repo.git',
  onAuth: () => ({
    username: 'user',
    password: 'token'
  })
})
```

### SSH Authentication

SSH authentication is handled at the connection level:

```javascript
import { sshClient } from 'universal-git/ssh/node'

// The SSH client handles authentication during connection
// For ssh2 package, you can configure authentication options
// For child_process fallback, use SSH key files or SSH agent
```

## Error Handling

All protocols provide proper error handling:

```javascript
try {
  await clone({
    fs,
    http,
    dir: './my-repo',
    url: 'https://github.com/user/repo.git'
  })
} catch (error) {
  if (error.code === 'ENOTFOUND') {
    console.error('Repository not found')
  } else if (error.code === 'EAUTH') {
    console.error('Authentication failed')
  } else {
    console.error('Clone failed:', error.message)
  }
}
```

## Browser Support

- **HTTP/HTTPS**: ✅ Fully supported via `universal-git/http/web`
- **Git Daemon (git://)**: ⚠️ Requires custom TCP client implementation
- **SSH**: ⚠️ Requires custom SSH client implementation (not practical in browsers)

For browser environments, HTTP/HTTPS is the recommended protocol.

## Implementation Details

### Protocol Classes

- `GitRemoteHTTP` - HTTP Smart Protocol (`src/git/remote/GitRemoteHTTP.ts`)
- `GitRemoteDaemon` - Git Daemon Protocol (`src/git/remote/GitRemoteDaemon.ts`)
- `GitRemoteSSH` - SSH Protocol (`src/git/remote/GitRemoteSSH.ts`)
- `GitRemoteHTTPDumb` - HTTP Dumb Protocol (`src/git/remote/GitRemoteHTTPDumb.ts`)

### Client Interfaces

- `HttpClient` - HTTP client interface
- `TcpClient` - TCP client interface (`src/daemon/TcpClient.ts`)
- `SshClient` - SSH client interface (`src/ssh/SshClient.ts`)

### Node.js Implementations

- `universal-git/http/node` - Node.js HTTP client
- `universal-git/daemon/node` - Node.js TCP client
- `universal-git/ssh/node` - Node.js SSH client

## See Also

- [HTTP Documentation](./http.md) - Detailed HTTP protocol documentation
- [Authentication Documentation](./authentication.md) - Authentication callbacks
- [Progress Documentation](./onProgress.md) - Progress reporting

