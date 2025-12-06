Main Porcelain Commands
**Priority 0**   add                     Add file contents to the index
**Priority 5**   am                      Apply a series of patches from a mailbox
**Priority 5**   archive                 Create an archive of files from a named tree
**Priority 1**   bisect                  Use binary search to find the commit that introduced a bug    
**Priority 1**   branch                  List, create, or delete branches
**Priority 3**   bundle                  Move objects and refs by archive
**Priority 0**   checkout                Switch branches or restore working tree files
**Priority 1**   cherry-pick             Apply the changes introduced by some existing commits
**Priority 6**   gui citool              Graphical alternative to git-commit
**Priority 1**   clean                   Remove untracked files from the working tree
**Priority 1**   clone                   Clone a repository strips by options
**Priority 0**   commit                  Record changes to the repository
**Priority 2**   describe                Give an object a human readable name based on an available ref
**Priority 1**   diff                    Show changes between commits, commit and working tree, etc    
**Priority 1**   fetch                   Download objects and refs from another repository
**Priority 5**   format-patch            Prepare patches for e-mail submission
**Priority 3**   gc                      Cleanup unnecessary files and optimize the local repository   
**Priority 6**   gitk                    The Git repository browser
**Priority 3**   grep                    Print lines matching a pattern
**Priority 6**   gui                     A portable graphical interface to Git
**Priority 1**   init                    Create an empty Git repository or reinitialize an existing one
**Priority 1**   log                     Show commit logs
**Priority 3**   maintenance             Run tasks to optimize Git repository data
**Priority 1**   merge                   Join two or more development histories together
**Priority 1**   mv                      Move or rename a file, a directory, or a symlink
**Priority 2**   notes                   Add or inspect object notes
**Priority 1**   pull                    Fetch from and integrate with another repository or a local branch
**Priority 1**   push                    Update remote refs along with associated objects
**Priority 2**   range-diff              Compare two commit ranges (e.g. two versions of a branch)     
**Priority 1**   rebase                  Reapply commits on top of another base tip
**Priority 1**   reset                   Reset current HEAD to the specified state
**Priority 1**   restore                 Restore working tree files
**Priority 2**   revert                  Revert some existing commits
**Priority 1**   rm                      Remove files from the working tree and from the index
**Priority 4**   scalar                  A tool for managing large Git repositories
**Priority 2**   shortlog                Summarize 'git log' output
**Priority 0**   show                    Show various types of objects
**Priority 2**   sparse-checkout         Reduce your working tree to a subset of tracked files
**Priority 2**   stash                   Stash the changes in a dirty working directory away
**Priority 1**   status                  Show the working tree status
**Priority 2**   submodule               Initialize, update or inspect submodules
**Priority 1**   switch                  Switch branches
**Priority 2**   tag                     Create, list, delete or verify a tag object signed with GPG   
**Priority 2**   worktree                Manage multiple working trees

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
**Priority 3**   ls-remote               List references in a remote repository
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

**Priority 3** Low-level Commands / Syncing Repositories
   daemon                  A really simple server for Git repositories
   fetch-pack              Receive missing objects from another repository
   http-backend            Server side implementation of Git over HTTP
   send-pack               Push objects over Git protocol to another repository
   update-server-info      Update auxiliary info file to help dumb servers

Low-level Commands / Internal Helpers
**Priority 0**   check-attr              Display gitattributes information
**Priority 2**   check-ignore            Debug gitignore / exclude files
**Priority 3**   check-mailmap           Show canonical names and email addresses of contacts
**Priority 3**   check-ref-format        Ensures that a reference name is well formed
**Priority 4**   column                  Display data in columns
**Priority 6**   credential              Retrieve and store user credentials
**Priority 6**   credential-cache        Helper to temporarily store passwords in memory
**Priority 6**   credential-store        Helper to store credentials on disk
**Priority 5**   fmt-merge-msg           Produce a merge commit message
**Priority 3**   hook                    Run git hooks
**Priority 0**   interpret-trailers      Add or parse structured information in commit messages        
**Priority 2**   mailinfo                Extracts patch and authorship from a single e-mail message    
**Priority 4**   mailsplit               Simple UNIX mbox splitter program
**Priority 4**   merge-one-file          The standard helper program to use with git-merge-index       
**Priority 0**   patch-id                Compute unique ID for a patch
   sh-i18n                 Git's i18n setup code for shell scripts
**Priority 6**   sh-setup                Common Git shell script setup code
**Priority 1**   stripspace              Remove unnecessary whitespace

Ancillary Commands / Interrogators
**Priority 3**   annotate                Annotate file lines with commit information
**Priority 3**   blame                   Show what revision and author last modified each line of a file
**Priority 6**   bugreport               Collect information for user to file a bug report
**Priority 3**   count-objects           Count unpacked number of objects and their disk consumption   
**Priority 6**   diagnose                Generate a zip archive of diagnostic information
**Priority 6**   difftool                Show changes using common diff tools
**Priority 3**   fsck                    Verifies the connectivity and validity of the objects in the database
**Priority 6**   gitweb                  Git web interface (web frontend to Git repositories)
**Priority 6**   help                    Display help information about Git
**Priority 6**   instaweb                Instantly browse your working repository in gitweb
**Priority 1**   merge-tree              Perform merge without touching index or working tree
**Priority 3**   rerere                  Reuse recorded resolution of conflicted merges
**Priority 2**   show-branch             Show branches and their commits
**Priority 2**   verify-commit           Check the GPG signature of commits
**Priority 2**   verify-tag              Check the GPG signature of tags
**Priority 6**   version                 Display version information about Git
**Priority 2**   whatchanged             Show logs with differences each commit introduces

**Priority 4**  Ancillary Commands / Manipulators
   config                  Get and set repository or global options
   fast-export             Git data exporter
   fast-import             Backend for fast Git data importers
   filter-branch           Rewrite branches
   mergetool               Run merge conflict resolution tools to resolve merge conflicts
**Priority 1**   pack-refs               Pack heads and tags for efficient repository access
**Priority 3**   prune                   Prune all unreachable objects from the object database        
**Priority 1**   reflog                  Manage reflog information
**Priority 1**   remote                  Manage set of tracked repositories
**Priority 1**   repack                  Pack unpacked objects in a repository
**Priority 1**   replace                 Create, list, delete refs to replace objects

**Priority 7** Interacting with Others
   archimport              Import a GNU Arch repository into Git
   cvsexportcommit         Export a single commit to a CVS checkout
   cvsimport               Salvage your data out of another SCM people love to hate      
   cvsserver               A CVS server emulator for Git
   imap-send               Send a collection of patches from stdin to an IMAP folder     
   p4                      Import from and submit to Perforce repositories
   quiltimport             Applies a quilt patchset onto the current branch
   request-pull            Generates a summary of pending changes
   send-email              Send a collection of patches as emails
   svn                     Bidirectional operation between a Subversion repository and Git

User-facing repository, command and file interfaces
**Priority 1**   attributes              Defining attributes per path
**Priority 6**   cli                     Git command-line interface and conventions
**Priority 2**   hooks                   Hooks used by Git
**Priority 1**   ignore                  Specifies intentionally untracked files to ignore
**Priority 3**   mailmap                 Map author/committer names and/or E-Mail addresses
**Priority 3**   modules                 Defining submodule properties
   repository-layout       Git Repository Layout
**Priority 3**   revisions               Specifying revisions and ranges for Git

**Priority 6**  External commands
   askpass
   askyesno
   bash
   credential-helper-selector
   credential-manager
   flow
   lfs