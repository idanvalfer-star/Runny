import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'

/**
 * Builds a single self-contained HTML file for sharing as a hosted demo.
 *
 * Differences from the real app, all forced by having no server: routing moves
 * to the hash, code splitting is off so there are no chunks to fetch, and the
 * service worker is dropped (it needs a real origin and scope).
 */
function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (f) => f.type === 'asset' && f.fileName.endsWith('.html'),
      )
      if (!html || html.type !== 'asset') return

      let source = String(html.source)

      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          // Escape any closing tag inside the JS so it cannot end the script early.
          const code = file.code.replace(/<\/script>/gi, '<\\/script>')
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${file.fileName}"[^>]*></script>`),
            // A replacer function, not a string: minified code is full of `$\``
            // and `$&`, which String.replace would treat as substitutions and
            // silently corrupt the bundle.
            () => `<script type="module">${code}</script>`,
          )
          delete bundle[file.fileName]
        } else if (file.fileName.endsWith('.css')) {
          const css = String(file.source)
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${file.fileName}"[^>]*>`),
            () => `<style>${css}</style>`,
          )
          delete bundle[file.fileName]
        }
      }

      html.source = source
    },
  }
}

/** Inlines the favicon so the page makes no network requests at all. */
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (f) => f.type === 'asset' && f.fileName.endsWith('.html'),
      )
      if (!html || html.type !== 'asset') return
      const svg = readFileSync('public/favicon.svg', 'utf8')
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      html.source = String(html.source).replace('/favicon.svg', dataUri)
    },
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_STANDALONE': JSON.stringify('1'),
    // With code splitting off, Vite leaves this preload placeholder behind in
    // the lazy() call sites and nothing ever defines it.
    __VITE_PRELOAD__: 'void 0',
  },
  plugins: [react(), tailwindcss(), inlineEverything(), inlineFavicon()],
  build: {
    outDir: 'dist-standalone',
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // One chunk: a single file has nowhere to fetch a second one from.
        codeSplitting: false,
      },
    },
  },
})
