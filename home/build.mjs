// Builds the home screen into one self-contained HTML file (fonts, CSS and JS inlined).
// Output: ../device/home/index.html
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const font = (w) => 'data:font/woff2;base64,' + readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff2`)).toString('base64')

const res = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: ['chrome56'], minify: true, write: false, legalComments: 'none' })
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script')
const css = readFileSync('src/style.css', 'utf8').replace('FONT400', font(400)).replace('FONT600', font(600)).replace('FONT700', font(700))
const html = readFileSync('index.html', 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => js)

mkdirSync('../device/home', { recursive: true })
writeFileSync('../device/home/index.html', html)
console.log('device/home/index.html', (html.length / 1024).toFixed(1) + ' KB')
