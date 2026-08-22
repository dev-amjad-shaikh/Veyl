import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['tests/harness.ts'],
  outfile: 'tests/.build/harness.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'warning',
});
