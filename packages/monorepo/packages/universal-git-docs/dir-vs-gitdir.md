---
title: "dir vs gitdir"
sidebar_label: dir vs gitdir
---

I looked hard and wide for a good explanation of the "working tree" and the "git directory" and the best I found was this one:

> If you have a non-bare git repository, there are two parts to it: the *git directory* and the *working tree*:
>
> - The *working tree* has your checked out source code, with any changes you might have made.
> - The *git directory* is normally named `.git`, and is in the top level of your working tree - this contains all the history of your project, configuration settings, pointers to branches, the index (staging area) and so on.
> 
> While this is the default layout of a git repository, you can actually set any directories in the filesystem to be your git directory and working tree. You can change these directories from their defaults either with the --work-tree and --git-dir options to git or by using the GIT_DIR and GIT_WORK_TREE environment variables. Usually, however, you shouldn't need to set these.
>
> — [Mark Longair from Stack Overflow](https://stackoverflow.com/a/5283457)

The universal-git equivalent of `--work-tree` is the **`dir`** argument (or **`worktree: GitWorktreeBackend`** in the new API).

The universal-git equivalent of `--git-dir` is the **`gitdir`** argument (or **`gitBackend: GitBackend`** in the new API).

**New API (Recommended):**
- Use `gitBackend: GitBackend` instead of `gitdir: string`
- Use `worktree: GitWorktreeBackend` instead of `dir: string`

**Legacy API (Deprecated):**
- `dir` and `gitdir` parameters are still supported for backward compatibility but are deprecated

This is really only important when working with bare repositories. Most of the time setting `dir` (or `worktree`) is sufficient, because `gitdir` (or `gitBackend`) defaults to `path.join(dir, '.git')`.

## Linked Worktree Pattern

When both `dir` and `gitdir` are provided to `Repository.open()`, this is treated as a **linked worktree** scenario:

- **`gitdir`** === bare repository (or main repository) - the path to the `.git` directory
- **`dir`** === linked worktree checkout - the working directory

This matches Git's standard worktree pattern where the worktree's `.git` is a **file** (not a directory) pointing to the gitdir. The implementation treats the gitdir as a bare repository and uses the dir as the working directory.

**Example (Legacy API):**
```typescript
// Linked worktree: gitdir is bare repo, dir is worktree checkout
const repo = await Repository.open({
  fs,
  dir: '/path/to/worktree',           // Worktree checkout directory
  gitdir: '/path/to/bare-repo/.git', // Bare repository gitdir
})
```

**Example (New API with Backends):**
```typescript
import { createBackend } from 'universal-git/backends'
import { createGitWorktreeBackend } from 'universal-git/git/worktree'

const gitBackend = createBackend({
  type: 'filesystem',
  fs,
  gitdir: '/path/to/bare-repo/.git'
})

const worktree = createGitWorktreeBackend({
  fs,
  dir: '/path/to/worktree'
})

const repo = await Repository.open({
  gitBackend,
  worktree
})
```

**Important**: When both parameters are provided (either legacy `dir`/`gitdir` or new `worktree`/`gitBackend`), no inference is performed - the provided paths are used as-is. The gitdir (or gitBackend) is treated as a bare repository, and the dir (or worktree) is used as the working directory.
