// Builds The Legend of Sting into one self-contained HTML file for the Car Thing's old Chromium.
// Output: ../device/home/apps/sting/index.html
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
const res = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: ['chrome56'], minify: true, write: false, legalComments: 'none' })
const font = 'data:font/woff2;base64,' + readFileSync('../source/public/fonts/vt323.woff2').toString('base64')
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script').replace('FONTURL', font)
const html = readFileSync('index.html', 'utf8').replace('/*JS*/', () => js)
mkdirSync('../device/home/apps/sting', { recursive: true })
writeFileSync('../device/home/apps/sting/index.html', html)
console.log('device/home/apps/sting/index.html', (html.length / 1024).toFixed(1) + ' KB')
