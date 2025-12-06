/**
 * Example: Standalone WebSocket TCP Proxy Server
 * 
 * This example shows how to run a standalone proxy server that bridges
 * WebSocket connections (from browsers) to TCP Git daemon servers.
 * 
 * Usage:
 *   node --experimental-strip-types daemon/proxy/example.ts
 */

import { createWebSocketTcpProxy } from './WebSocketTcpProxy.ts'

async function main() {
  console.log('Starting WebSocket TCP Proxy Server for Git Daemon...')
  
  const proxy = await createWebSocketTcpProxy({
    port: 8080,
    host: '0.0.0.0', // Listen on all interfaces
    path: '/git-daemon-proxy',
    defaultGitDaemonPort: 9418
  })

  console.log(`✅ WebSocket TCP Proxy running at: ${proxy.getWebSocketUrl()}`)
  console.log('')
  console.log('The proxy is ready to accept connections from browsers.')
  console.log('Browsers can connect using:')
  console.log(`  ${proxy.getWebSocketUrl()}?host=<git-daemon-host>&port=<git-daemon-port>`)
  console.log('')
  console.log('Example browser usage:')
  console.log('  setWebSocketProxyConfig({ proxyUrl: "ws://localhost:8080/git-daemon-proxy" })')
  console.log('')
  console.log('Press Ctrl+C to stop the proxy server.')

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down proxy server...')
    await proxy.stop()
    console.log('✅ Proxy server stopped.')
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down proxy server...')
    await proxy.stop()
    console.log('✅ Proxy server stopped.')
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('❌ Failed to start proxy server:', error)
  process.exit(1)
})

