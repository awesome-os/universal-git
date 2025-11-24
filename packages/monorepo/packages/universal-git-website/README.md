# universal-git Website

Modern documentation website built with [VitePress](https://vitepress.dev/).

## Migration from Docusaurus

This website has been migrated from Docusaurus v1 to VitePress for:
- **Better performance**: VitePress uses Vite for lightning-fast builds
- **Modern tooling**: Built on Vue 3 and Vite
- **Better TypeScript support**: Native TypeScript configuration
- **Active maintenance**: VitePress is actively maintained and updated

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Documentation Structure

The documentation source files are located in the root `../docs/` folder. VitePress is configured to read from there.

## Linting

Text linting is done with `textlint`:

```bash
# Lint all markdown files
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

## Static Assets

Static assets (images, CSS, JS) should be placed in `website/static/` and will be served from the root path `/` in the built site.

## Note

This website is for local development and preview only. Publishing/deployment steps have been removed.

