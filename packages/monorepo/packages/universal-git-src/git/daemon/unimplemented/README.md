# Alternative Implementations

This folder contains alternative implementations for Git daemon protocol support. These are valid options for different use cases.

## browser-error-implementation.ts

A lightweight browser implementation that provides clear error messages when Git daemon protocol is attempted in browser environments.

**Status**: ✅ Active Alternative Implementation

**Use Case**: 
- When you don't want to depend on the `ws` package
- When you don't want to bundle WebSocket proxy support
- When you want clear, helpful error messages instead of runtime failures
- For builds that explicitly exclude TCP/WebSocket functionality

**When to use**:
- Lightweight builds without WebSocket dependencies
- Applications that will never use `git://` URLs
- Builds where bundle size is critical
- When you want to fail fast with clear errors rather than attempting connection

**Alternative**: For full Git daemon support in browsers, use `../web/index.ts` which implements Git daemon protocol via WebSocket proxy

## Implementation Options

### Option 1: Error Implementation (This folder)
```typescript
// Lightweight - no dependencies, clear errors
import { tcpClient } from '@awesome-os/universal-git-src/daemon/unimplemented/browser-error-implementation'

// Attempting git:// will throw a helpful error message
```

### Option 2: WebSocket Proxy (../web/index.ts)
```typescript
// Full support - requires ws package and proxy server
import { tcpClient, setWebSocketProxyConfig } from '@awesome-os/universal-git-src/daemon/web'

// Configure proxy
setWebSocketProxyConfig({ proxyUrl: 'ws://localhost:8080/git-daemon-proxy' })

// git:// URLs work in browsers via proxy
```

Choose the implementation that fits your build requirements and use case.

