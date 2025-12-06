class GitTransport {
  static connect(config) {
    if (typeof config === 'string') { // Handle legacy URL-only
      config = { type: config.startsWith('http') ? 'http' : 'ssh', url: config };
    }
    
    switch (config.type) {
      case 'http':
        return new HttpTransport(config.url);
      case 'ssh':
        return new SshTransport(config.url);
      case 'sql':
        return new SqlTransport({ client: config.client });
      case 'fs':
        return new FileSystemTransport({ path: config.path, fs: config.fs });
      default:
        throw new Error(`Unsupported transport type: ${config.type}`);
    }
  }
  // ...
}