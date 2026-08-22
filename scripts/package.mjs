/**
 * Packs dist/ into the zip the Chrome Web Store expects.
 *
 * The store wants the manifest at the root of the archive, not inside a folder,
 * so this zips the *contents* of dist/. It refuses to package a build that
 * disagrees with the source, because the store review compares them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';

if (!existsSync('dist/manifest.json')) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}

const source = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const built = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (JSON.stringify(source) !== JSON.stringify(built)) {
  console.error('dist/manifest.json is stale. Run `npm run build` first.');
  process.exit(1);
}

const out = `veyl-${built.version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', `../${out}`, '.', '-x', '.DS_Store'], { cwd: 'dist', stdio: 'inherit' });

const size = (readFileSync(out).length / 1024).toFixed(0);
console.log(`\n${out} — ${size} KB, version ${built.version}`);
console.log('Upload at https://chrome.google.com/webstore/devconsole');
