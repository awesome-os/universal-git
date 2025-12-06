export function translateSSHtoHTTP(url: string): string {
  // handle "shorter scp-like syntax" with optional port: git@host:port:path or git@host:path
  const scpMatch = url.match(/^git@([^:]+)(?::(\d+))?:(.+)$/)
  if (scpMatch) {
    const [, host, port, path] = scpMatch
    return port ? `https://${host}:${port}/${path}` : `https://${host}/${path}`
  }
  // handle proper SSH URLs
  url = url.replace(/^ssh:\/\//, 'https://')
  return url
}

