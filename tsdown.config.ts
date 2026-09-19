import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/strict.ts', 'src/metadata.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  platform: 'neutral',
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  exports: false,
  publint: true,
  attw: true,
});
