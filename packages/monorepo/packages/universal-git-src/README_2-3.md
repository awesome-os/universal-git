Main Porcelain Commands
**Priority 3**   bundle                  Move objects and refs by archive
**Priority 2**   describe                Give an object a human readable name based on an available ref
**Priority 3**   gc                      Cleanup unnecessary files and optimize the local repository   
**Priority 3**   grep                    Print lines matching a pattern
xisting one
**Priority 3**   maintenance             Run tasks to optimize Git repository data
**Priority 2**   notes                   Add or inspect object notes
ocal branch
**Priority 2**   range-diff              Compare two commit ranges (e.g. two versions of a branch)     
**Priority 2**   revert                  Revert some existing commits
**Priority 2**   shortlog                Summarize 'git log' output
**Priority 2**   sparse-checkout         Reduce your working tree to a subset of tracked files
**Priority 2**   stash                   Stash the changes in a dirty working directory away
**Priority 2**   submodule               Initialize, update or inspect submodules
**Priority 2**   tag                     Create, list, delete or verify a tag object signed with GPG   
**Priority 2**   worktree                Manage multiple working trees

Low-level Commands / Interrogators
**Priority 3**   ls-remote               List references in a remote repository

**Priority 3** Low-level Commands / Syncing Repositories
   daemon                  A really simple server for Git repositories
   fetch-pack              Receive missing objects from another repository
   http-backend            Server side implementation of Git over HTTP
   send-pack               Push objects over Git protocol to another repository
   update-server-info      Update auxiliary info file to help dumb servers

Low-level Commands / Internal Helpers
**Priority 2**   check-ignore            Debug gitignore / exclude files
**Priority 3**   check-mailmap           Show canonical names and email addresses of contacts
**Priority 3**   check-ref-format        Ensures that a reference name is well formed
**Priority 3**   hook                    Run git hooks
**Priority 2**   mailinfo                Extracts patch and authorship from a single e-mail message    

Ancillary Commands / Interrogators
**Priority 3**   annotate                Annotate file lines with commit information
**Priority 3**   blame                   Show what revision and author last modified each line of a file
**Priority 3**   count-objects           Count unpacked number of objects and their disk consumption   
**Priority 3**   fsck                    Verifies the connectivity and validity of the objects in the database
**Priority 3**   rerere                  Reuse recorded resolution of conflicted merges
**Priority 2**   show-branch             Show branches and their commits
**Priority 2**   verify-commit           Check the GPG signature of commits
**Priority 2**   verify-tag              Check the GPG signature of tags
**Priority 2**   whatchanged             Show logs with differences each commit introduces

Ancillary Commands / Manipulators
**Priority 3**   prune                   Prune all unreachable objects from the object database        

User-facing repository, command and file interfaces
**Priority 2**   hooks                   Hooks used by Git
**Priority 3**   mailmap                 Map author/committer names and/or E-Mail addresses
**Priority 3**   modules                 Defining submodule properties
   repository-layout       Git Repository Layout
**Priority 3**   revisions               Specifying revisions and ranges for Git

