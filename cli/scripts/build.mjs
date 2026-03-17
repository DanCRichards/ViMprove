import * as esbuild from 'esbuild';
import { chmodSync } from 'fs';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/vimprove.js',
  banner: { js: '#!/usr/bin/env node' },
});

chmodSync('dist/vimprove.js', 0o755);
console.log('Built dist/vimprove.js');
