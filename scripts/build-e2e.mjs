/**
 * Builds a copy of the extension whose only difference is that host access is
 * already granted, because Chrome's permission bubble is browser UI that no
 * automation can click. Everything else — the manifest, the service worker,
 * the page scripts, the popup — is the shipped build byte for byte.
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist-e2e', { recursive: true, force: true });
await cp('dist', 'dist-e2e', { recursive: true });

const manifest = JSON.parse(await readFile('dist-e2e/manifest.json', 'utf8'));
manifest.host_permissions = ['http://*/*', 'https://*/*'];
await writeFile('dist-e2e/manifest.json', JSON.stringify(manifest, null, 2));
console.log('dist-e2e: host access pre-granted for automation');
