import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'universal-git',
  description: 'A pure JavaScript reimplementation of git for node and browsers',
  base: '/',
  
  // Public assets directory (relative to docs folder)
  publicDir: '../website/static',
  
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
            { text: 'Web Worker Guide', link: '/guide-webworker' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Alphabetic List', link: '/alphabetic' },
            { text: 'Snippets', link: '/snippets' },
            { text: 'FAQ', link: '/faq' }
          ]
        },
        {
          text: 'Clients',
          items: [
            { text: 'File System (fs)', link: '/fs' },
            { text: 'HTTP Client', link: '/http' },
            { text: 'Authentication', link: '/authentication' },
            { text: 'Headers', link: '/headers' },
            { text: 'Protocols', link: '/protocols' }
          ]
        },
        {
          text: 'Callbacks',
          items: [
            { text: 'onAuth', link: '/onAuth' },
            { text: 'onAuthSuccess', link: '/onAuthSuccess' },
            { text: 'onAuthFailure', link: '/onAuthFailure' },
            { text: 'onMessage', link: '/onMessage' },
            { text: 'onPostCheckout', link: '/onPostCheckout' },
            { text: 'onPrePush', link: '/onPrePush' },
            { text: 'onProgress', link: '/onProgress' },
            { text: 'onSign', link: '/onSign' },
            { text: 'mergeDriver', link: '/mergeDriver' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Cache', link: '/cache' },
            { text: 'Directory vs Git Directory', link: '/dir-vs-gitdir' },
            { text: 'Factory Pattern', link: '/factory-pattern' },
            { text: 'Architecture: Ref Writing', link: '/ARCHITECTURE_REF_WRITING' }
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

