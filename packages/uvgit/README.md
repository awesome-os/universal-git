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
    Evolved into a Distributed Implementation that is faster for most workflows then legacy GIT Versioning Systems.
    It allows you to treat Repository compilations as Streams for large scale code processing and AI Next Gen Usage.
</p>

## Usecases in AwesomeOS
Easy Compilation of code creation pipelines including validation ci/cd autonomouse review 

Advanced features like
Universal Blast Analyzes on Global Code Existence Scale. Eg changing stuff in the Linux Kernel in a specific branch would
directly report world wide impact on existing tracked global so code deduplication and global Treat reaction becomes unified.

<p align="center">
  <a href="https://www.npmjs.com/package/universal-git"><img src="https://img.shields.io/npm/v/universal-git.svg?style=flat-square" alt="NPM Version"></a>
  <a href="https://github.com/awesome-os/universal-git/actions/workflows/ci.yml"><img src="https://github.com/awesome-os/universal-git/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/universal-git"><img src="https://img.shields.io/npm/dm/universal-git.svg?style=flat-square" alt="NPM Downloads"></a>
  <a href="https://github.com/awesome-os/universal-git/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/universal-git.svg?style=flat-square" alt="MIT License"></a>
</p>

---

`universal-git` forked from `isomorphic-git`, was created to provide the community with a stable, actively maintained library that embraces modern JavaScript, fixes long-standing bugs, and offers a clear path forward.

---

### 🧭 TL;DR — Publishing Philosophy

We ship **TypeScript directly** — modern runtimes can run it.
Production builds use **`universal-git-bundle`**, which includes only our code (no polyfills).
**Polyfills are optional** and loaded dynamically by environment.
Developers decide what to include — **we stay minimal and future-proof**.

---

## Comming from isomorphic-git?

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

## Overview
<p align="center">
  <a href="https://github.com/awesome-os/universal-git">
    <img src="https://raw.githubusercontent.com/awesome-os/universal-git/refs/heads/main/packages/assets/architecture.excalidraw.svg" alt="universal-git logo" width="100%">
  </a>
</p>


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

The API is designed to be intuitive and powerful. We work with the same concept like git scalar clone

my-app/                  <-- The "Enlistment Root"
├── src/                 <-- The actual Git Repository
│   ├── .git/            <-- Git metadata (config, objects, refs)
│   ├── .gitignore
│   ├── README.md
│   └── (Your Files)     <-- Managed by Sparse Checkout
└── (Build Artifacts)    <-- (Optional) Binaries/Logs generated later

```javascript
// index.mjs
import fs from 'node:fs'
import http from 'node:http' // Use a proper http client in production
import { clone } from 'universal-git'

// This is where we'll clone the repo
const dir = './cloned-repo';
const dirHandle = new FileSystem
// Let's go!
const enlistment = await clone({
  { fs, dir, noSrc: true },
  { 
    url: 'https://github.com/awesome-os/universal-git.git',
    http,
  },
  hooks: {},
  onMessage: (message) => console.log(message), // Real-time progress updates
  onProgress: (progress) => console.log(`${progress.phase}: ${progress.loaded}/${progress.total}`),
  onError: (error) => console.error('❌ Cloning failed:', error)
});

//  clone places the cloned repository within a <entlistment>/src directory. Use --no-src to place the cloned repository directly in the <enlistment> directory.
const myEnlistment = new Enlistment({ fs, dir })
console.log('✅ Repository cloned successfully!')

const worktrees = enlistment.getWorktrees(); // Fun fact a fresh clone has only a single worktree inital
const worktree = worktrees[0] // enlistment.getWorktree();

// when the statusStream gets abortSignal after fileCreated it has no effect
// when it gets a abortSignal on isIgnored no write will be executed 
const verboseIfIgnored = (err) => {
    // Warning matches .gitignore
    if (err.code === 'GIT_IGNORED') {
        console.log('do not even allow to stage ignored files')
        // wehen we return Promise.reject throw error
        // or any none truthy value like doing nothing
        // so void then(write) gets not performed!
        
        // Default behavior on add(path) ifIgnored
        return false
    } else {
        // Default behavior on createFile
        return true
    }
};
  
// content supports everything that Blob does so stream anything. 
// the 3rd arg is a Promise.catch(handler)
// FYI: note how it looks internal
// verify(path).catch(yourHandler).then(
//   (shouldWrite) => shouldWrite && write(content)
// );
// so that you can choose what to do on Error. Default
// we simple return Promise.rejected(err).cause

const srcDir = worktree.find(({name}) => name === 'src');

// Zero cost copy the put operation adds a dirEntry to a DirEntry only checks for 
// pre existence of the 
srcDir.mkDir('subFolder').linkNode(srcDir); // not use full outside of refactoring but still

// note that both below lines lead to the same effect in universal-git nothing changes
// in our internal structure when same Enlistment gets nested it is like a worktree
srcDir.mkDir('subFolder').addWorktree(srcDir);
// addWorktree under the hood creates a .git gitDirHandle containing objects and refs from 

// This for example makes subfolder equal to srcDir so like a symlink 
srcDir.mkDir('subFolder').register(
    new Enlistment({ fs, dir, noSrc: true, noCheckout: true })
);

// as enlistment.worktrees is not structural dependent
enlistment.worktrees[0]
enlistment.worktrees[1]
enlistment.worktrees[2]
// are identical

// perform a worktree checkout
srcDir.mkDir('subFolder').checkout("ref: head/main",{ branch: "feature/new-protocol" });
srcDir.mkDir('subFolder').switch("ref: head/main",{ branch: "feature/new-protocol" });

// perform a worktree checkout
srcDir.mkDir('subFolder').checkout("ref: head/main", { sparse: ["tests","!tests/browser"] });

// creates copy on write CoW so only changed files get new files inside subFolder
srcDir.mkDir('subFolder').write('name-of-file.js', content, verboseIfIgnored).add();

// same as above but more simple if you do not need fine Grained Controll
srcDir.createFile(path||'subFolder/name-of-file.js', content, verboseIfIgnored);

// same as above but more simple if you do not need fine Grained Controll

// Note that the defaukt worktree createFile is eg gitIgnore aware.
// it runs common git logic on Transactions.
worktree.createFile(path||'src/subFolder/name-of-file.js', content, verboseIfIgnored);
worktree.addFile(path||'src/subFolder/name-of-file.js', verboseIfIgnored);

// as worktree is a entrie of gitDir[] it is parent aware!
// supports to be used in multiple gitDir instances
// Allows you to add a file to many Repos or references in  a single add call
// also commit call on multiple gitDir instances could even be diffrent objectFormat
// Ideal for sha1 => sha256 Multi Repo use cases!!!!

// the transformStream gets the (contentStream) => contentStream
// so you can do in between wahat ever you like prepend apend. 
// run codeMod bundlers etc linters
worktree.updateFile(path, TransformStream);
worktree.deleteFile(path);
const fileHandle = worktree.getFile(path||'src/subFolder/name-of-file.js');
fileHandle.update(TransformStream); // returns fileHandle

// add() => worktreeDir
fileHandle.add().commit("Add: example file");
// same as above 
srcDir.add().commit("Add: example file",verboseIfIgnored);

// Diffrent handles with correct handling
// makes it easy to know if it was before commited or staging only
// delete() => removedUnstagedFileHandle || removedStagedFileHandle
// Note: delete when removedStagedFileHandle supports add()
// Note if verboseIfIgnored aborts the add we get  removedUnstagedFileHandle
//   so you can not commit the delete to now commit the delete get the fileHandle and add without
//   the verboseIfIgnored helper from above this is only to teach you the concept
//   it makes most time zero sense to put logic into the add after a delete
//   but the api concept is consistent!
fileHandle.delete()?.add(verboseIfIgnored)?.commit(
    { 
        message: "(chor): was only added as example" , 
        hooks: enlistment.hooks 
    }
); 
// Note hooks are optional but allow good control hooks is a getter for all you can use getHook() setHook
//  on the returned hooksDir instance. 

// so if the file was never commited there is no add and so no commit
// total simple api

// if a fileHandle has no oid then it never got staged so never cached. or commited
```

follow up
```js
const refs = enlistment.getRefs(); // also getRef() and supports a '' string to point to it
const objects = enlistment.getObjects();
const namespaces = enlistment.getNamespaces() // Fun fact namespaces can not exist on a fresh clone 
```

## 🚚 Incremental Migrating from `isomorphic-git`

```bash
npm install isomorphic-git@npm:universal-git
```

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

That's it! The core API remains compatible, but you now benefit from all the underlying improvements and a modern Composit Chainable design.

## 📚 Documentation

For a full API reference, tutorials, and advanced guides, please visit our **[official documentation site](https://github.com/awesome-os/universal-git/)**.

The documentation covers everything from basic commands like `commit` and `push` to advanced topics like plugin authoring and using custom backends.

## 🤝 Contributing

We welcome contributions of all kinds! Whether you're fixing a bug, adding a feature, or improving documentation, your help is appreciated.

1.  **Fork the repository** and create your branch from `main`.
2.  Run `npm install` to set up the development environment.
3.  Make your changes and add a issue.
4.  Ensure the test suite passes (`npm test`). (Without your tests its enough when old keeps working)
5.  Submit a pull request!

## ❤️ Acknowledgments

This project would not be possible without the foundational work done by the original creators and contributors of `isomorphic-git`. We are deeply grateful for their contribution to the open-source community and aim to honor their legacy by keeping this powerful tool alive and thriving.

## 📜 License

This project is licensed under the [MIT License](https://github.com/awesome-os/universal-git/blob/main/LICENSE).
