# WebSocket TCP Proxy for Git Daemon Protocol

This module provides a WebSocket-based proxy server that bridges browser WebSocket connections to TCP Git daemon servers, enabling Git daemon protocol (`git://`) usage in browser environments.

## Architecture

```
Browser (WebSocket) → Proxy Server (WebSocket ↔ TCP) → Git Daemon Server (TCP)
```

## Usage

### Starting the Proxy Server (Node.js)

```typescript
import { createWebSocketTcpProxy } from '@awesome-os/universal-git-src/daemon/proxy'

// Start proxy server
const proxy = await createWebSocketTcpProxy({
  port: 8080,
  host: 'localhost',
  path: '/git-daemon-proxy',
  defaultGitDaemonPort: 9418
})

console.log(`Proxy server running at: ${proxy.getWebSocketUrl()}`)

// Stop the proxy server when done
// await proxy.stop()
```

### Using in Browser

```typescript
import { setWebSocketProxyConfig } from '@awesome-os/universal-git-src/daemon/web'
import { clone } from '@awesome-os/universal-git-src/index'

// Configure WebSocket proxy URL
setWebSocketProxyConfig({
  proxyUrl: 'ws://localhost:8080/git-daemon-proxy'
})

// Now you can use git:// URLs in the browser!
await clone({
  fs,
  http,
  dir: '/tmp/repo',
  url: 'git://example.com/repo.git'
})
```

## Configuration

### Proxy Server Options

- `port` (default: `8080`): Port for the WebSocket proxy server
- `host` (default: `localhost`): Host for the WebSocket proxy server
- `path` (default: `/git-daemon-proxy`): WebSocket connection path
- `defaultGitDaemonPort` (default: `9418`): Default Git daemon port if not specified in URL

### Browser Configuration

The browser client accepts the target Git daemon server via query parameters:
- `host`: Target Git daemon server hostname
- `port`: Target Git daemon server port

Example WebSocket URL:
```
ws://localhost:8080/git-daemon-proxy?host=example.com&port=9418
```

## Protocol Flow

1. Browser creates WebSocket connection to proxy server with target host/port in query string
2. Proxy server establishes TCP connection to Git daemon server
3. Proxy server sends `{ type: 'connected' }` message to browser
4. All subsequent data is forwarded bidirectionally:
   - Browser → WebSocket → Proxy → TCP → Git Daemon
   - Git Daemon → TCP → Proxy → WebSocket → Browser

## Security Considerations

⚠️ **Important**: This proxy server forwards connections without authentication. Only use it in trusted environments or add authentication/authorization as needed.

For production use, consider:
- Adding authentication to the WebSocket proxy
- Using WSS (secure WebSocket) instead of WS
- Restricting which hosts/ports the proxy can connect to
- Rate limiting and connection limits

## Dependencies

The proxy server requires the `ws` package. Since this is an optional feature (only needed for browser git:// support), you'll need to install it separately:

```bash
npm install ws
npm install --save-dev @types/ws
```

**Note**: The `ws` package is not included in the main dependencies because:
1. The proxy server is only needed for browser environments
2. Most users will use HTTP/HTTPS in browsers (recommended)
3. The proxy server is a separate component that can be run independently

## Example: Standalone Proxy Server

```typescript
// proxy-server.ts
import { createWebSocketTcpProxy } from '@awesome-os/universal-git-src/daemon/proxy'

async function main() {
  const proxy = await createWebSocketTcpProxy({
    port: 8080,
    host: '0.0.0.0', // Listen on all interfaces
    path: '/git-daemon-proxy'
  })

  console.log(`WebSocket TCP Proxy running at: ${proxy.getWebSocketUrl()}`)
  console.log('Press Ctrl+C to stop')

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down proxy server...')
    await proxy.stop()
    process.exit(0)
  })
}

main().catch(console.error)
```

