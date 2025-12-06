Main Porcelain Commands
**Priority 5**   am                      Apply a series of patches from a mailbox
**Priority 5**   archive                 Create an archive of files from a named tree
**Priority 6**   gui citool              Graphical alternative to git-commit
**Priority 5**   format-patch            Prepare patches for e-mail submission
**Priority 6**   gitk                    The Git repository browser
**Priority 6**   gui                     A portable graphical interface to Git
**Priority 4**   scalar                  A tool for managing large Git repositories

Low-level Commands / Internal Helpers
**Priority 4**   column                  Display data in columns
**Priority 6**   credential              Retrieve and store user credentials
**Priority 6**   credential-cache        Helper to temporarily store passwords in memory
**Priority 6**   credential-store        Helper to store credentials on disk
**Priority 5**   fmt-merge-msg           Produce a merge commit message
**Priority 4**   mailsplit               Simple UNIX mbox splitter program
**Priority 4**   merge-one-file          The standard helper program to use with git-merge-index       
**Priority 6**   sh-setup                Common Git shell script setup code

Ancillary Commands / Interrogators
**Priority 6**   bugreport               Collect information for user to file a bug report
**Priority 6**   diagnose                Generate a zip archive of diagnostic information
**Priority 6**   difftool                Show changes using common diff tools
**Priority 6**   gitweb                  Git web interface (web frontend to Git repositories)
**Priority 6**   help                    Display help information about Git
**Priority 6**   instaweb                Instantly browse your working repository in gitweb
**Priority 6**   version                 Display version information about Git

**Priority 4** Ancillary Commands / Manipulators
   config                  Get and set repository or global options
   fast-export             Git data exporter
   fast-import             Backend for fast Git data importers
   filter-branch           Rewrite branches
   mergetool               Run merge conflict resolution tools to resolve merge conflicts

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
**Priority 6**   cli                     Git command-line interface and conventions
   repository-layout       Git Repository Layout

**Priority 6**  External commands
   askpass
   askyesno
   bash
   credential-helper-selector
   credential-manager
   flow
   lfs