// Builds a single self-contained HTML file (no modules, works from file:// on old Chromium)
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
const res = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: ['chrome56'], minify: true, write: false, legalComments: 'none' })
const js = res.outputFiles[0].text
const font = readFileSync('public/fonts/vt323.woff2').toString('base64')
const html = readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${js.replace(/<\/script/g, '<\\/script').replace('./fonts/vt323.woff2', 'data:font/woff2;base64,' + font)}</script>`)
mkdirSync('out', { recursive: true })
writeFileSync('out/index.html', html)
console.log('out/index.html', (html.length / 1024).toFixed(1) + ' KB')
