{
  "GitObjects": {
    "comment": "Represents the four fundamental, immutable object types in Git.",
    "Blob": {
      "oid": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      "type": "blob",
      "content": "<Buffer ...>"
    },
    "Tree": {
      "oid": "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      "type": "tree",
      "entries": [
        {
          "mode": "100644",
          "type": "blob",
          "oid": "f4f242594689912066d705d932b0a99e2365a1b3",
          "path": "README.md"
        },
        {
          "mode": "040000",
          "type": "tree",
          "oid": "c85777519195b1c0027b47a8335017585253049b",
          "path": "src"
        }
      ]
    },
    "Commit": {
      "oid": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "type": "commit",
      "tree": "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      "parent": [
        "f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3b4a5f0e1"
      ],
      "author": {
        "name": "Alice",
        "email": "alice@example.com",
        "timestamp": 1672531200,
        "timezone": "-0500"
      },
      "committer": {
        "name": "Alice",
        "email": "alice@example.com",
        "timestamp": 1672531200,
        "timezone": "-0500"
      },
      "message": "feat: Initial commit\n\nAdd project structure and README."
    },
    "Tag": {
      "comment": "This is an 'annotated' tag object, not a simple ref.",
      "oid": "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      "type": "tag",
      "object": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "objectType": "commit",
      "tag": "v1.0.0",
      "tagger": {
        "name": "Bob",
        "email": "bob@example.com",
        "timestamp": 1672617600,
        "timezone": "-0500"
      },
      "message": "Release version 1.0.0"
    }
  },
  "References": {
    "comment": "Represents the pointers in the .git/refs/ directory and packed-refs.",
    "HEAD": {
      "comment": "The current location. Can be symbolic (pointing to a branch) or detached (pointing to a commit).",
      "symbolic": true,
      "value": "ref: refs/heads/main"
    },
    "DetachedHEAD": {
      "symbolic": false,
      "value": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    },
    "Ref": {
      "comment": "A generic reference, like a branch, tag, or remote branch.",
      "path": "refs/heads/main",
      "value": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    },
    "TagRef": {
      "comment": "A simple 'lightweight' tag is just a ref pointing to a commit.",
      "path": "refs/tags/lightweight-tag",
      "value": "f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3b4a5f0e1"
    }
  },
  "Index": {
    "comment": "The staging area (.git/index). A binary file, conceptually represented here.",
    "version": 2,
    "entries": [
      {
        "path": "README.md",
        "oid": "f4f242594689912066d705d932b0a99e2365a1b3",
        "stage": 0,
        "mode": 33188,
        "ctime": "2023-01-01T12:00:00.000Z",
        "mtime": "2023-01-01T12:00:00.000Z",
        "size": 1234,
        "uid": 1000,
        "gid": 1000
      },
      {
        "comment": "Example of a file in a merge conflict state.",
        "path": "src/app.js",
        "oid": "oid_of_common_ancestor_version",
        "stage": 1,
        "mode": 33188
      },
      {
        "path": "src/app.js",
        "oid": "oid_of_our_version_(HEAD)",
        "stage": 2,
        "mode": 33188
      },
      {
        "path": "src/app.js",
        "oid": "oid_of_their_version_(MERGE_HEAD)",
        "stage": 3,
        "mode": 33188
      }
    ]
  },
  "Configuration": {
    "comment": "Represents the .git/config file, typically in INI format.",
    "core": {
      "repositoryformatversion": 0,
      "filemode": true,
      "bare": false
    },
    "user": {
      "name": "Alice",
      "email": "alice@example.com"
    },
    "remote": {
      "origin": {
        "url": "https://github.com/universal-git/universal-git.git",
        "fetch": "+refs/heads/*:refs/remotes/origin/*"
      }
    },
    "branch": {
      "main": {
        "remote": "origin",
        "merge": "refs/heads/main"
      }
    }
  },
  "WorktreeState": {
    "comment": "Represents the state of a single working directory checkout.",
    "name": "main",
    "path": "/path/to/project",
    "HEAD": {
      "symbolic": true,
      "value": "ref: refs/heads/main"
    },
    "repository": "<pointer to the parent BareRepository object>",
    "sparseCheckoutConfig": null
  },
  "SubmodulesConfig": {
    "comment": "Represents the .gitmodules file.",
    "submodules": {
      "libs/parser": {
        "path": "libs/parser",
        "url": "https://github.com/user/parser.git"
      }
    }
  },
  "Gitignore": {
    "comment": "Represents the combined patterns from all applicable .gitignore files.",
    "patterns": [
      "node_modules/",
      "*.log",
      "build/",
      "!.env.example"
    ]
  },
  "Reflog": {
    "comment": "Represents the log of changes to a specific reference.",
    "ref": "HEAD",
    "entries": [
      {
        "oldOid": "0000000000000000000000000000000000000000",
        "newOid": "f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3b4a5f0e1",
        "committer": {
          "name": "Alice",
          "email": "alice@example.com",
          "timestamp": 1672531100
        },
        "message": "commit (initial): feat: Add project structure"
      },
      {
        "oldOid": "f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3b4a5f0e1",
        "newOid": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        "committer": {
          "name": "Alice",
          "email": "alice@example.com",
          "timestamp": 1672531200
        },
        "message": "commit: fix: Correct README typo"
      }
    ]
  }
}

{
  "comment": "Comprehensive model including low-level binary formats and internal structures.",

  "Part_1_Core_Object_Storage_Formats": {
    "LooseObject": {
      "comment": "The on-disk format for a single, un-packed Git object in .git/objects/ab/cdef.... It's a zlib-compressed file.",
      "path": ".git/objects/ab/cdef...",
      "format": "zlib-compressed",
      "decompressedContent": {
        "header": "commit 256\\0",
        "body": "<binary content of the commit object>"
      }
    },
    "Packfile_Dot_Pack": {
      "comment": "A single, highly compressed archive containing multiple Git objects to save space and improve I/O. This is the primary format for data transfer.",
      "path": ".git/objects/pack/pack-....pack",
      "structure": [
        {
          "section": "Header",
          "signature": "PACK",
          "version": 2,
          "objectCount": 12345
        },
        {
          "section": "Body",
          "comment": "A sequence of packed objects.",
          "packedObjects": [
            {
              "type": "OBJ_COMMIT",
              "comment": "A full, base object.",
              "data": "<zlib-compressed binary data for a commit>"
            },
            {
              "type": "OBJ_REF_DELTA",
              "comment": "A delta object, representing changes relative to another object identified by its OID.",
              "baseOid": "a1b2c3d4e5f6...",
              "deltaData": "<binary instructions to reconstruct the object from its base>"
            },
            {
              "type": "OBJ_OFS_DELTA",
              "comment": "A delta object, relative to a base object found at a negative offset within this same packfile.",
              "baseOffset": -456,
              "deltaData": "<binary instructions to reconstruct>"
            }
          ]
        },
        {
          "section": "Trailer",
          "comment": "SHA-1 checksum of the entire preceding packfile content.",
          "checksum": "f0e1d2c3b4a5..."
        }
      ]
    }
  },

  "Part_2_Performance_and_Indexing_Structures": {
    "Pack_Index_Dot_Idx": {
      "comment": "The index for a corresponding .pack file, allowing for fast, random access to any object within the pack without reading the entire file.",
      "path": ".git/objects/pack/pack-....idx",
      "version": 2,
      "structure": {
        "header": "<magic number and version>",
        "fanoutTable": "<array of 256 integers pointing into the OID table>",
        "sortedOidTable": "<concatenated list of all object OIDs in the pack>",
        "crcChecksums": "<list of CRC32 checksums for each object's packed data>",
        "packfileOffsets": "<list of 4-byte (or 8-byte for large packs) offsets for each object into the .pack file>"
      }
    },
    "Bitmap_Index_Dot_Bitmap": {
      "comment": "An optional, advanced index that pre-computes reachability information. It drastically speeds up object counting and pack generation for fetches/clones.",
      "path": ".git/objects/pack/pack-....bitmap",
      "structure": {
        "header": "<magic number 'BITM' and version>",
        "bitmaps": [
          {
            "commitOid": "a1b2c3d4e5f6...",
            "comment": "The commit this bitmap represents.",
            "bitmapData": "<compressed EWAH bitmap representing the set of objects reachable from this commit>"
          }
        ],
        "packfileChecksum": "<SHA-1 of the .pack file this bitmap corresponds to>"
      }
    },
    "Commit_Graph": {
      "comment": "An optional cache that stores commit ancestry information in a structured way, dramatically speeding up log traversal and merge-base calculations.",
      "path": ".git/objects/info/commit-graph",
      "structure": {
        "header": "<magic number 'CGRF' and version>",
        "tableOfContents": "<list of chunk IDs and their offsets>",
        "chunks": [
          {
            "id": "OIDF",
            "data": "<Fanout table for commit OIDs>"
          },
          {
            "id": "OIDL",
            "data": "<Sorted list of commit OIDs in the graph>"
          },
          {
            "id": "CDAT",
            "data": "<Commit data: root tree OID, parent indices, generation number, timestamps>"
          }
        ]
      }
    },
    "Multi_Pack_Index_MIDX": {
      "comment": "An index that spans multiple packfiles, allowing Git to look for an object in a single index file instead of checking every individual .idx file.",
      "path": ".git/objects/pack/multi-pack-index",
      "structure": {
        "header": "<magic number 'MIDX' and version>",
        "tableOfContents": "<list of chunk IDs and their offsets>",
        "chunks": [
          {
            "id": "PNAM",
            "data": "<List of packfile names covered by this MIDX>"
          },
          {
            "id": "OIDF",
            "data": "<Fanout table for OIDs across all packs>"
          },
          {
            "id": "OIDL",
            "data": "<Sorted list of OIDs, where each entry also contains the index of the packfile it belongs to>"
          }
        ]
      }
    }
  },

  "Part_3_Working_Copy_and_Staging_Area": {
    "Index_File_Detailed": {
      "comment": "A more detailed, binary-aware representation of the .git/index file (the staging area).",
      "path": ".git/index",
      "structure": {
        "header": {
          "signature": "DIRC",
          "version": 2,
          "entryCount": 5
        },
        "entries": [
          {
            "path": "README.md",
            "oid": "f4f242594689...",
            "metadata": "<fixed-width binary metadata: ctime, mtime, dev, ino, mode, uid, gid, size>"
          }
        ],
        "extensions": [
          {
            "signature": "TREE",
            "comment": "Cache of tree objects created from the index to speed up `git commit`.",
            "data": "<binary representation of cached trees>"
          },
          {
            "signature": "EOIE",
            "comment": "End of Index Entry, marks the end of the standard entries.",
            "data": "<path data for entries with very long names>"
          }
        ],
        "checksum": "<SHA-1 of the entire index file content before the checksum>"
      }
    }
  },

  "Part_4_Specialized_Git_Constructs_Implementations": {
    "StashCommit": {
      "comment": "A stash is not a unique object type. It is a special commit object with a specific parent structure, referenced by .git/refs/stash.",
      "oid": "<oid of the stash commit>",
      "type": "commit",
      "tree": "<oid of the tree representing the stashed working directory>",
      "parent": [
        "<oid of the commit that was HEAD when `git stash` was run>",
        "<oid of the commit representing the index state when `git stash` was run>"
      ],
      "author": { "...": "..." },
      "committer": { "...": "..." },
      "message": "WIP on main: a1b2c3d feat: Some feature"
    },
    "NotesTree": {
      "comment": "Notes are also not a unique object type. They are blob objects stored in a special tree structure under refs/notes/commits.",
      "structure": {
        "notesRef": {
          "path": "refs/notes/commits",
          "value": "<oid of the root notes tree>"
        },
        "rootNotesTree": {
          "oid": "<oid of the root notes tree>",
          "type": "tree",
          "entries": [
            {
              "mode": "100644",
              "type": "blob",
              "oid": "<oid of the note blob>",
              "path": "<oid of the commit being annotated>"
            }
          ]
        },
        "noteBlob": {
          "oid": "<oid of the note blob>",
          "type": "blob",
          "content": "This is a code review note."
        }
      }
    }
  }
}