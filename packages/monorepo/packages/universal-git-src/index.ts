import { STAGE } from './git/backends/GitBackendFs/commands/STAGE.ts'
import { TREE } from './git/backends/GitBackendFs/commands/TREE.ts'
import { WORKDIR } from './git/backends/GitBackendFs/commands/WORKDIR.ts'
import { abortMerge } from './git/backends/GitBackendFs/commands/abortMerge.ts'
import { add } from './git/backends/GitBackendFs/commands/add.ts'
import { addNote } from './git/backends/GitBackendFs/commands/addNote.ts'
import { addRemote } from './git/backends/GitBackendFs/commands/addRemote.ts'
import { annotatedTag } from './git/backends/GitBackendFs/commands/annotatedTag.ts'
import { branch } from './git/backends/GitBackendFs/commands/branch.ts'
import { checkout } from './git/backends/GitBackendFs/commands/checkout.ts'
import { clone } from './git/backends/GitBackendFs/commands/clone.ts'
import { commit } from './git/backends/GitBackendFs/commands/commit.ts'
import { currentBranch } from './git/backends/GitBackendFs/commands/currentBranch.ts'
import { deleteBranch } from './git/backends/GitBackendFs/commands/deleteBranch.ts'
import { deleteRef } from './git/backends/GitBackendFs/commands/deleteRef.ts'
import { deleteRemote } from './git/backends/GitBackendFs/commands/deleteRemote.ts'
import { deleteTag } from './git/backends/GitBackendFs/commands/deleteTag.ts'
import { diff } from './git/backends/GitBackendFs/commands/diff.ts'
import { expandOid } from './git/backends/GitBackendFs/commands/expandOid.ts'
import { expandRef } from './git/backends/GitBackendFs/commands/expandRef.ts'
import { fastForward } from './git/backends/GitBackendFs/commands/fastForward.ts'
import { fetch } from './git/backends/GitBackendFs/commands/fetch.ts'
import { findMergeBase } from './git/backends/GitBackendFs/commands/findMergeBase.ts'
import { findRoot } from './git/backends/GitBackendFs/commands/findRoot.ts'
import { getConfig } from './git/backends/GitBackendFs/commands/getConfig.ts'
import { getConfigAll } from './git/backends/GitBackendFs/commands/getConfigAll.ts'
import { deleteConfig } from './git/backends/GitBackendFs/commands/deleteConfig.ts'
import { getRemoteInfo } from './git/backends/GitBackendFs/commands/getRemoteInfo.ts'
import { hashBlob } from './git/backends/GitBackendFs/commands/hashBlob.ts'
import { indexPack } from './git/backends/GitBackendFs/commands/indexPack.ts'
import { init } from './git/backends/GitBackendFs/commands/init.ts'
import { isDescendent } from './git/backends/GitBackendFs/commands/isDescendent.ts'
import { isIgnored } from './git/backends/GitBackendFs/commands/isIgnored.ts'
import { listBranches } from './git/backends/GitBackendFs/commands/listBranches.ts'
import { listFiles } from './git/backends/GitBackendFs/commands/listFiles.ts'
import { listNotes } from './git/backends/GitBackendFs/commands/listNotes.ts'
import { listRefs } from './git/backends/GitBackendFs/commands/listRefs.ts'
import { listRemotes } from './git/backends/GitBackendFs/commands/listRemotes.ts'
import { listServerRefs } from './git/backends/GitBackendFs/commands/listServerRefs.ts'
import { listTags } from './git/backends/GitBackendFs/commands/listTags.ts'
import { log } from './git/backends/GitBackendFs/commands/log.ts'
import { merge } from './git/backends/GitBackendFs/commands/merge.ts'
import { packObjects } from './git/backends/GitBackendFs/commands/packObjects.ts'
import { bundle, verifyBundle, unbundle } from './git/backends/GitBackendFs/commands/bundle.ts'
import { pull } from './git/backends/GitBackendFs/commands/pull.ts'
import { push } from './git/backends/GitBackendFs/commands/push.ts'
import { readBlob } from './git/backends/GitBackendFs/commands/readBlob.ts'
import { readCommit } from './git/backends/GitBackendFs/commands/readCommit.ts'
import { readNote } from './git/backends/GitBackendFs/commands/readNote.ts'
import { readObject } from './git/backends/GitBackendFs/commands/readObject.ts'
import { readTag } from './git/backends/GitBackendFs/commands/readTag.ts'
import { readTree } from './git/backends/GitBackendFs/commands/readTree.ts'
import { remove } from './git/backends/GitBackendFs/commands/remove.ts'
import { removeNote } from './git/backends/GitBackendFs/commands/removeNote.ts'
import { renameBranch } from './git/backends/GitBackendFs/commands/renameBranch.ts'
import { resetIndex } from './git/backends/GitBackendFs/commands/resetIndex.ts'
import { resetToCommit } from './git/backends/GitBackendFs/commands/reset.ts'
import { resolveRef } from './git/backends/GitBackendFs/commands/resolveRef.ts'
import { setConfig } from './git/backends/GitBackendFs/commands/setConfig.ts'
import { rebase } from './git/backends/GitBackendFs/commands/rebase.ts'
import { cherryPick } from './git/backends/GitBackendFs/commands/cherryPick.ts'
import { sparseCheckout } from './git/backends/GitBackendFs/commands/sparseCheckout.ts'
import { submodule } from './git/backends/GitBackendFs/commands/submodule.ts'
import { worktree } from './git/backends/GitBackendFs/commands/worktree.ts'
import { lfs } from './git/backends/GitBackendFs/commands/lfs.ts'
import { stash } from './git/backends/GitBackendFs/commands/stash.ts'
import { status } from './git/backends/GitBackendFs/commands/status.ts'
import { statusMatrix } from './git/backends/GitBackendFs/commands/statusMatrix.ts'
import { tag } from './git/backends/GitBackendFs/commands/tag.ts'
import { ungit } from './git/backends/GitBackendFs/commands/ungit.ts'
import { updateIndex } from './git/backends/GitBackendFs/commands/updateIndex.ts'
import { version } from './git/backends/GitBackendFs/utils/version.ts'
import { walk } from './git/backends/GitBackendFs/commands/walk.ts'
import { writeBlob } from './git/backends/GitBackendFs/commands/writeBlob.ts'
import { writeCommit } from './git/backends/GitBackendFs/commands/writeCommit.ts'
import { writeRef } from './git/backends/GitBackendFs/commands/writeRef.ts'
import { writeTag } from './git/backends/GitBackendFs/commands/writeTag.ts'
import { writeTree } from './git/backends/GitBackendFs/commands/writeTree.ts'
import * as Errors from './git/errors/index.ts'

// named exports
export {
  Errors,
  STAGE,
  TREE,
  WORKDIR,
  abortMerge,
  add,
  addNote,
  addRemote,
  annotatedTag,
  branch,
  checkout,
  clone,
  commit,
  getConfig,
  getConfigAll,
  setConfig,
  deleteConfig,
  currentBranch,
  deleteBranch,
  deleteRef,
  deleteRemote,
  deleteTag,
  diff,
  expandOid,
  expandRef,
  fastForward,
  fetch,
  findMergeBase,
  findRoot,
  getRemoteInfo,
  hashBlob,
  indexPack,
  init,
  isDescendent,
  isIgnored,
  listBranches,
  listFiles,
  listNotes,
  listRefs,
  listRemotes,
  listServerRefs,
  listTags,
  log,
  merge,
  packObjects,
  bundle,
  verifyBundle,
  unbundle,
  pull,
  push,
  readBlob,
  readCommit,
  readNote,
  readObject,
  readTag,
  readTree,
  remove,
  removeNote,
  renameBranch,
  resetIndex,
  resetToCommit,
  updateIndex,
  resolveRef,
  rebase,
  cherryPick,
  status,
  statusMatrix,
  sparseCheckout,
  submodule,
  worktree,
  lfs,
  tag,
  ungit,
  version,
  walk,
  writeBlob,
  writeCommit,
  writeRef,
  writeTag,
  writeTree,
  stash,
}

// Export types
export type { SubmoduleStatus } from './git/backends/GitBackendFs/commands/submodule.ts'

// Export UniversalBuffer for external use
export { UniversalBuffer } from './git/backends/GitBackendFs/utils/UniversalBuffer.ts'
export type { UniversalBufferLike } from './git/backends/GitBackendFs/utils/UniversalBuffer.ts'

// Export UniversalTransport layer
export * from './transport/index.ts'

// Export Worker infrastructure
export * from './workers/index.ts'

export { Repository } from './core-utils/Repository.ts'
