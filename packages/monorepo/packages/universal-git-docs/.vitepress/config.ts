import { defineConfig } from 'vitepress'

// Convert camelCase to kebab-case
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// Markdown plugin to rewrite camelCase links to kebab-case
function markdownPlugin(md: any) {
  // Process links during tokenization
  md.core.ruler.after('normalize', 'camel-to-kebab-links', (state: any) => {
    const tokens = state.tokens
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      
      // Process inline tokens
      if (token.type === 'inline' && token.children) {
        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j]
          
          // Process link_open tokens
          if (child.type === 'link_open') {
            const href = child.attrGet('href')
            
            // Only process relative links that look like camelCase
            if (href && 
                !href.startsWith('http') && 
                !href.startsWith('/') && 
                !href.includes('/') && 
                !href.includes('.') && 
                !href.includes('#') && 
                /[a-z][A-Z]/.test(href)) {
              const kebabCase = camelToKebab(href)
              child.attrSet('href', kebabCase)
            }
          }
        }
      }
    }
  })
}

export default defineConfig({
  title: 'universal-git',
  description: 'A pure JavaScript reimplementation of git for node and browsers',
  base: '/',
  
  // Output directory (relative to source directory: docs/)
  outDir: '../build/website',
  
  // Public assets directory (relative to docs folder)
  publicDir: '../website/static',
  
  // Markdown configuration
  markdown: {
    config: (md) => {
      markdownPlugin(md)
    }
  },
  
  // Ignore dead links for now (many docs reference files in versioned_docs)
  ignoreDeadLinks: true,
  
  head: [
    ['link', { rel: 'icon', href: '/img/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#000000' }]
  ],

  themeConfig: {
    logo: '/img/isomorphic-git-logo.svg',
    
    nav: [
      { text: 'API Docs', link: '/alphabetic' },
      { text: 'Guide', link: '/guide-quickstart' },
      { text: 'GitHub', link: 'https://github.com/awesome-os/universal-git' },
      { text: 'npm', link: 'https://npmjs.com/package/universal-git' }
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/guide-quickstart' },
            { text: 'Quick Start with Bundlers', link: '/guide-quickstart-with-bundlers' },
            { text: 'CLI Guide', link: '/guide-cli' },
            { text: 'Web Worker Guide', link: '/guide-webworker' },
            { text: 'FAQ', link: '/faq' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Repository Class', link: '/repository' },
            { text: 'Backends', link: '/backends' },
            { text: 'UniversalBuffer', link: '/universal-buffer' },
            { text: 'Directory vs Git Directory', link: '/dir-vs-gitdir' },
            { text: 'Factory Pattern', link: '/factory-pattern' },
            { text: 'Cache', link: '/cache' }
          ]
        },
        {
          text: 'Repository Operations',
          items: [
            { text: 'init', link: '/init' },
            { text: 'clone', link: '/clone' },
            { text: 'commit', link: '/commit' },
            { text: 'log', link: '/log' },
            { text: 'show', link: '/show' },
            { text: 'find-root', link: '/find-root' },
            { text: 'walk', link: '/walk' }
          ]
        },
        {
          text: 'Branches',
          items: [
            { text: 'branch', link: '/branch' },
            { text: 'current-branch', link: '/current-branch' },
            { text: 'list-branches', link: '/list-branches' },
            { text: 'delete-branch', link: '/delete-branch' },
            { text: 'rename-branch', link: '/rename-branch' }
          ]
        },
        {
          text: 'Tags',
          items: [
            { text: 'tag', link: '/tag' },
            { text: 'annotated-tag', link: '/annotated-tag' },
            { text: 'list-tags', link: '/list-tags' },
            { text: 'delete-tag', link: '/delete-tag' },
            { text: 'read-tag', link: '/read-tag' },
            { text: 'write-tag', link: '/write-tag' }
          ]
        },
        {
          text: 'Files & Status',
          items: [
            { text: 'add', link: '/add' },
            { text: 'remove', link: '/remove' },
            { text: 'list-files', link: '/list-files' },
            { text: 'status', link: '/status' },
            { text: 'status-matrix', link: '/status-matrix' },
            { text: 'is-ignored', link: '/is-ignored' },
            { text: 'diff', link: '/diff' }
          ]
        },
        {
          text: 'Checkout & Reset',
          items: [
            { text: 'checkout', link: '/checkout' },
            { text: 'reset', link: '/reset' },
            { text: 'reset-index', link: '/reset-index' },
            { text: 'update-index', link: '/update-index' },
            { text: 'sparse-checkout', link: '/sparse-checkout' }
          ]
        },
        {
          text: 'Remotes & Networking',
          items: [
            { text: 'remote', link: '/remote' },
            { text: 'add-remote', link: '/add-remote' },
            { text: 'delete-remote', link: '/delete-remote' },
            { text: 'list-remotes', link: '/list-remotes' },
            { text: 'get-remote-info', link: '/get-remote-info' },
            { text: 'list-server-refs', link: '/list-server-refs' },
            { text: 'fetch', link: '/fetch' },
            { text: 'push', link: '/push' },
            { text: 'pull', link: '/pull' }
          ]
        },
        {
          text: 'Merge & Rebase',
          items: [
            { text: 'merge', link: '/merge' },
            { text: 'abort-merge', link: '/abort-merge' },
            { text: 'fast-forward', link: '/fast-forward' },
            { text: 'find-merge-base', link: '/find-merge-base' },
            { text: 'rebase', link: '/rebase' },
            { text: 'cherry-pick', link: '/cherry-pick' }
          ]
        },
        {
          text: 'Objects & Plumbing',
          items: [
            { text: 'read-blob', link: '/read-blob' },
            { text: 'write-blob', link: '/write-blob' },
            { text: 'read-commit', link: '/read-commit' },
            { text: 'write-commit', link: '/write-commit' },
            { text: 'read-tree', link: '/read-tree' },
            { text: 'write-tree', link: '/write-tree' },
            { text: 'read-object', link: '/read-object' },
            { text: 'hash-blob', link: '/hash-blob' },
            { text: 'expand-oid', link: '/expand-oid' },
            { text: 'expand-ref', link: '/expand-ref' },
            { text: 'resolve-ref', link: '/resolve-ref' }
          ]
        },
        {
          text: 'References',
          items: [
            { text: 'list-refs', link: '/list-refs' },
            { text: 'write-ref', link: '/write-ref' },
            { text: 'delete-ref', link: '/delete-ref' },
            { text: 'reflog', link: '/reflog' },
            { text: 'is-descendent', link: '/is-descendent' }
          ]
        },
        {
          text: 'Notes',
          items: [
            { text: 'add-note', link: '/add-note' },
            { text: 'read-note', link: '/read-note' },
            { text: 'remove-note', link: '/remove-note' },
            { text: 'list-notes', link: '/list-notes' }
          ]
        },
        {
          text: 'Stash & Worktrees',
          items: [
            { text: 'stash', link: '/stash' },
            { text: 'worktrees', link: '/worktrees' }
          ]
        },
        {
          text: 'Advanced Features',
          items: [
            { text: 'submodules', link: '/submodules' },
            { text: 'bundle', link: '/bundle' },
            { text: 'unbundle', link: '/unbundle' },
            { text: 'verify-bundle', link: '/verify-bundle' },
            { text: 'lfs', link: '/lfs' },
            { text: 'sha256', link: '/sha256' }
          ]
        },
        {
          text: 'Callbacks & Hooks',
          items: [
            { text: 'onAuth', link: '/onAuth' },
            { text: 'onAuthSuccess', link: '/onAuthSuccess' },
            { text: 'onAuthFailure', link: '/onAuthFailure' },
            { text: 'onMessage', link: '/onMessage' },
            { text: 'onPostCheckout', link: '/onPostCheckout' },
            { text: 'onPrePush', link: '/onPrePush' },
            { text: 'onProgress', link: '/onProgress' },
            { text: 'onSign', link: '/onSign' },
            { text: 'mergeDriver', link: '/mergeDriver' },
            { text: 'hooks', link: '/hooks' }
          ]
        },
        {
          text: 'Clients & Configuration',
          items: [
            { text: 'File System (fs)', link: '/fs' },
            { text: 'HTTP Client', link: '/http' },
            { text: 'Authentication', link: '/authentication' },
            { text: 'Headers', link: '/headers' },
            { text: 'Protocols', link: '/protocols' },
            { text: 'get-config', link: '/get-config' },
            { text: 'get-config-all', link: '/get-config-all' },
            { text: 'set-config', link: '/set-config' }
          ]
        },
        {
          text: 'Architecture & Internals',
          items: [
            { text: 'Architecture Overview', link: '/architecture' },
            { text: 'Architecture: Ref Writing', link: '/ARCHITECTURE_REF_WRITING' },
            { text: 'Debugging', link: '/debugging' }
          ]
        },
        {
          text: 'Migration & Contributing',
          items: [
            { text: 'Buffer to UniversalBuffer', link: '/migration/buffer-to-universal-buffer' },
            { text: 'Contributing: Testing', link: '/contributing/testing' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Alphabetic List', link: '/alphabetic' },
            { text: 'Snippets', link: '/snippets' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/awesome-os/universal-git' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © ${new Date().getFullYear()} universal-git Contributors`
    },

    search: {
      provider: 'local',
      options: {
        placeholder: 'Search documentation...'
      }
    },

    editLink: {
      pattern: 'https://github.com/awesome-os/universal-git/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})

