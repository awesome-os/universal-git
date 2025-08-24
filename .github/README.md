<p align="center">
  <a href="https://github.com/awesome-os/universal-git">
    <img src="https://raw.githubusercontent.com/awesome-os/universal-git/refs/heads/main/packages/assets/readme-logo.svg" alt="universal-git logo" width="400">
  </a>
</p>

## universal-git

<h3 align="center">A modern, maintained, and universal JavaScript Git implementation. With batterys Included!</h3>

<p align="center">
 is a pure JavaScript implementation of Git, designed to run in any modern JavaScript environment. It is an actively maintained fork of the popular isomorphic-git library, extended with powerful new features for large-scale, programmatic source code management. The library offers universal compatibility, running seamlessly in Node.js, Deno, Bun, browsers, Web Workers, and specialized runtimes like Cloudflare Workers, V8 Isolates, and GraalVM. It is built for scale, including critical features like sparse checkouts designed for efficiently managing gigantic monorepos, and serves as a core dependency for a growing number of community projects. The motivation for this fork was born from the needs of compiler engineering and large-scale infrastructure development. When working on projects like Chromium, programmatic access to Git is essential for automating tasks across thousands of codebases and millions of lines of code. This library is a key component in the development of a next-generation, peer-to-peer (p2p) distributed build system—a conceptual replacement for Google's GOMA—designed to handle the unique challenges of giant, Git-based monorepos.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/universal-git"><img src="https://img.shields.io/npm/v/universal-git.svg?style=flat-square" alt="NPM Version"></a>
  <a href="https://github.com/awesome-os/universal-git/actions/workflows/ci.yml"><img src="https://github.com/awesome-os/universal-git/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/universal-git"><img src="https://img.shields.io/npm/dm/universal-git.svg?style=flat-square" alt="NPM Downloads"></a>
  <a href="https://github.com/awesome-os/universal-git/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/universal-git.svg?style=flat-square" alt="MIT License"></a>
</p>

---

`universal-git` forked from `isomorphic-git`, was created to provide the community with a stable, actively maintained library that embraces modern JavaScript, fixes long-standing bugs, and offers a clear path forward.

If you've been frustrated by the lack of updates or unresolved issues in `isomorphic-git`, you've come to the right place.

## ✨ Why Switch to `universal-git`?

| Feature | `isomorphic-git` (Legacy) | ✅ `universal-git` (Modern) |
| :--- | :--- | :--- |
| **Maintenance** | ⚠️ Stagnant, PRs ignored | 🚀 **Actively maintained** with weekly releases if needed! |
| **Codebase** | Old JS, callbacks, mixed promises | ✨ **Modern ES Modules & `async/await`** |
| **TypeScript** | External, often outdated types | 📦 **Ships with up-to-date types built-in** |
| **Dependencies** | Outdated, some legacy cruft | 🛡️ **Lean, audited, and modern dependencies** |
| **Bug Fixes** | Many long-standing issues remain | ✅ **Key bugs fixed** (e.g. packaging, sparse-checkout, stash push/pop,.....) |
| **Community** | Unresponsive | 💬 **Active community** |
| **Roadmap** | None | 🗺️ **Public roadmap** and clear feature pipeline |

## 🚀 Quick Start

### 1. Installation

```bash
npm install universal-git
# or
yarn add universal-git
# or
pnpm add universal-git
```

### 2. Usage Example: Clone a Repository (Node.js)

The API is designed to be intuitive and powerful. Here’s how you can clone a repository:

```javascript
// index.mjs
import fs from 'node:fs'
import http from 'node:http' // Use a proper http client in production
import { clone } from 'universal-git'

// This is where we'll clone the repo
const dir = './cloned-repo'

// Let's go!
;(async () => {
  try {
    await clone({
      fs,
      http,
      dir,
      url: 'https://github.com/awesome-os/universal-git',
      onMessage: (message) => console.log(message), // Real-time progress updates
      onProgress: (progress) => console.log(`${progress.phase}: ${progress.loaded}/${progress.total}`),
    })
    console.log('✅ Repository cloned successfully!')
  } catch (error) {
    console.error('❌ Cloning failed:', error)
  }
})()
```

## 🚚 Incremental Migrating from `isomorphic-git`

```bash
npm install isomorphic-git@npm:universal-git
```

That's it! The core API remains compatible, but you now benefit from all the underlying improvements and a modern `async/await`-first design.

## 🚚 FULL Migrating from `isomorphic-git`

Migrating is designed to be painless. For most projects, it's a simple 2-step process:

1.  **Uninstall the old package and install the new one:**
    ```bash
    npm uninstall isomorphic-git
    npm install universal-git
    ```

2.  **Update your imports:**
    Change all occurrences of `'isomorphic-git'` to `'universal-git'`.

    **Before:**
    ```javascript
    const git = require('isomorphic-git')
    // or
    import { clone } from 'isomorphic-git'
    ```

    **After:**
    ```javascript
    const git = require('universal-git') // CJS still supported
    // or (recommended)
    import { clone } from 'universal-git'
    ```

That's it! The core API remains compatible, but you now benefit from all the underlying improvements and a modern `async/await`-first design.

## 📚 Documentation

For a full API reference, tutorials, and advanced guides, please visit our **[official documentation site](https://github.com/awesome-os/universal-git/)**.

The documentation covers everything from basic commands like `commit` and `push` to advanced topics like plugin authoring and using custom backends.

## 🤝 Contributing

We welcome contributions of all kinds! Whether you're fixing a bug, adding a feature, or improving documentation, your help is appreciated.

1.  **Fork the repository** and create your branch from `main`.
2.  Run `npm install` to set up the development environment.
3.  Make your changes and add tests.
4.  Ensure the test suite passes (`npm test`).
5.  Submit a pull request!

Please check our **[CONTRIBUTING.md](https://github.com/awesome-os/universal-git/blob/main/CONTRIBUTING.md)** for more detailed guidelines and look for issues tagged with `good first issue`.

## ❤️ Acknowledgments

This project would not be possible without the foundational work done by the original creators and contributors of `isomorphic-git`. We are deeply grateful for their contribution to the open-source community and aim to honor their legacy by keeping this powerful tool alive and thriving.

## 📜 License

This project is licensed under the [MIT License](https://github.com/awesome-os/universal-git/blob/main/LICENSE).
