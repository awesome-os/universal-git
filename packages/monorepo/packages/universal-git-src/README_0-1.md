Main Porcelain Commands
**Priority 0**   add                     Add file contents to the index
**Priority 1**   bisect                  Use binary search to find the commit that introduced a bug    
**Priority 1**   branch                  List, create, or delete branches
**Priority 0**   checkout                Switch branches or restore working tree files
**Priority 1**   cherry-pick             Apply the changes introduced by some existing commits
**Priority 1**   clean                   Remove untracked files from the working tree
**Priority 1**   clone                   Clone a repository strips by options
**Priority 0**   commit                  Record changes to the repository
**Priority 1**   diff                    Show changes between commits, commit and working tree, etc    
**Priority 1**   fetch                   Download objects and refs from another repository
**Priority 1**   init                    Create an empty Git repository or reinitialize an existing one
**Priority 1**   log                     Show commit logs
**Priority 1**   merge                   Join two or more development histories together
**Priority 1**   mv                      Move or rename a file, a directory, or a symlink
**Priority 1**   pull                    Fetch from and integrate with another repository or a local branch
**Priority 1**   push                    Update remote refs along with associated objects
**Priority 1**   rebase                  Reapply commits on top of another base tip
**Priority 1**   reset                   Reset current HEAD to the specified state
**Priority 1**   restore                 Restore working tree files
**Priority 1**   rm                      Remove files from the working tree and from the index
**Priority 0**   show                    Show various types of objects
**Priority 1**   status                  Show the working tree status
**Priority 1**   switch                  Switch branches

**Priority 0** Developer-facing file formats, protocols and other interfaces
   format-bundle           The bundle file format
   format-chunk            Chunk-based file formats
   format-commit-graph     Git commit-graph format
   format-index            Git index format
   format-pack             Git pack format
   format-signature        Git cryptographic signature formats
   protocol-capabilities   Protocol v0 and v1 capabilities
   protocol-common         Things common to various protocols
   protocol-http           Git HTTP-based protocols
   protocol-pack           How packs are transferred over-the-wire
   protocol-v2             Git Wire Protocol, Version 2

**Priority 1** Low-level Commands / Manipulators
   apply                   Apply a patch to files and/or to the index
   checkout-index          Copy files from the index to the working tree
   commit-graph            Write and verify Git commit-graph files
   commit-tree             Create a new commit object
   hash-object             Compute object ID and optionally create an object from a file 
   index-pack              Build pack index file for an existing packed archive
   merge-file              Run a three-way file merge
   merge-index             Run a merge for files needing merging
   mktag                   Creates a tag object with extra validation
   mktree                  Build a tree-object from ls-tree formatted text
   multi-pack-index        Write and verify multi-pack-indexes
   pack-objects            Create a packed archive of objects
   prune-packed            Remove extra objects that are already in pack files
   read-tree               Reads tree information into the index
   symbolic-ref            Read, modify and delete symbolic refs
   unpack-objects          Unpack objects from a packed archive
   update-index            Register file contents in the working tree to the index       
   update-ref              Update the object name stored in a ref safely
   write-tree              Create a tree object from the current index

**Priority 1** Low-level Commands / Interrogators
   cat-file                Provide contents or details of repository objects
   cherry                  Find commits yet to be applied to upstream
   diff-files              Compares files in the working tree and the index
   diff-index              Compare a tree to the working tree or index
   diff-tree               Compares the content and mode of blobs found via two tree objects
   for-each-ref            Output information on each ref
   for-each-repo           Run a Git command on a list of repositories
   get-tar-commit-id       Extract commit ID from an archive created using git-archive   
   ls-files                Show information about files in the index and the working tree
   ls-tree                 List the contents of a tree object
   merge-base              Find as good common ancestors as possible for a merge
   name-rev                Find symbolic names for given revs
   pack-redundant          Find redundant pack files
   rev-list                Lists commit objects in reverse chronological order
   rev-parse               Pick out and massage parameters
   show-index              Show packed archive index
   show-ref                List references in a local repository
   unpack-file             Creates a temporary file with a blob's contents
   var                     Show a Git logical variable
   verify-pack             Validate packed Git archive files

Low-level Commands / Internal Helpers
**Priority 0**   check-attr              Display gitattributes information
**Priority 0**   interpret-trailers      Add or parse structured information in commit messages        
**Priority 0**   patch-id                Compute unique ID for a patch
   sh-i18n                 Git's i18n setup code for shell scripts
**Priority 1**   stripspace              Remove unnecessary whitespace

Ancillary Commands / Interrogators
**Priority 1**   merge-tree              Perform merge without touching index or working tree

Ancillary Commands / Manipulators
**Priority 1**   pack-refs               Pack heads and tags for efficient repository access
**Priority 1**   reflog                  Manage reflog information
**Priority 1**   remote                  Manage set of tracked repositories
**Priority 1**   repack                  Pack unpacked objects in a repository
**Priority 1**   replace                 Create, list, delete refs to replace objects

User-facing repository, command and file interfaces
**Priority 1**   attributes              Defining attributes per path
**Priority 1**   ignore                  Specifies intentionally untracked files to ignore
   repository-layout       Git Repository Layout

