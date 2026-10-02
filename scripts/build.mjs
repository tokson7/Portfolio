// Production build for Vercel.
//
// The pages are authored with in-browser JSX (<script type="text/babel">) so they
// can be edited and previewed with no tooling. In production that costs every
// visitor a 3 MB Babel download plus a 0.5–1.5 s compile on the main thread before
// anything renders. This script copies the site to dist/ and, for each HTML file:
//   - precompiles every text/babel script to a hashed external JS file (loaded with
//     `defer`, which runs after parsing — the same point Babel standalone ran it)
//   - drops @babel/standalone
//   - swaps React's development UMD builds for the production ones
// Source files are never modified.

import { transformSync } from '@babel/core';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist');

const SKIP = new Set(['dist', 'node_modules', 'scripts', '.git', '.vercel', '.claude', '.vscode',
  'package.json', 'package-lock.json', 'vercel.json', '.gitignore', 'README.md', 'LICENSE']);
const skipFile = (name) => SKIP.has(name) || name.endsWith('.py') || name.includes('backup') || name === '.DS_Store';

const REACT_VERSION = '18.3.1';
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const SWAPS = [
  [/<script src="https:\/\/unpkg\.com\/react@18\/umd\/react\.development\.js"[^>]*><\/script>/,
   `<script src="${CDN}/react/${REACT_VERSION}/umd/react.production.min.js" crossorigin></script>`],
  [/<script src="https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.development\.js"[^>]*><\/script>/,
   `<script src="${CDN}/react-dom/${REACT_VERSION}/umd/react-dom.production.min.js" crossorigin></script>`],
  [/\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone\/babel(\.min)?\.js"><\/script>/, ''],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const name of readdirSync(ROOT)) {
  if (skipFile(name)) continue;
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true, filter: (src) => !skipFile(src.split('/').pop()) });
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);
}

const jsDir = join(OUT, 'js', 'build');
for (const file of htmlFiles(OUT)) {
  let html = readFileSync(file, 'utf8');
  if (!html.includes('type="text/babel"')) continue;

  const rel = relative(OUT, file);
  const depth = rel.split('/').length - 1;
  let n = 0;
  html = html.replace(/<script type="text\/babel">([\s\S]*?)<\/script>/g, (_, src) => {
    const { code } = transformSync(src, {
      presets: [['@babel/preset-react', { runtime: 'classic' }]],
      babelrc: false, configFile: false, compact: false, comments: false,
    });
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 10);
    const name = `${rel.replace(/\//g, '_').replace(/\.html$/, '')}-${n++}.${hash}.js`;
    if (!existsSync(jsDir)) mkdirSync(jsDir, { recursive: true });
    writeFileSync(join(jsDir, name), code);
    return `<script defer src="${'../'.repeat(depth)}js/build/${name}"></script>`;
  });
  for (const [from, to] of SWAPS) html = html.replace(from, to);
  if (html.includes('@babel/standalone') || html.includes('type="text/babel"')) {
    throw new Error(`${rel}: Babel still referenced after build`);
  }
  writeFileSync(file, html);
  console.log(`built ${rel} (${n} script${n === 1 ? '' : 's'} precompiled)`);
}
