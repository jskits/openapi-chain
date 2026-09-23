import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  platform: 'neutral',
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  publint: true,
  attw: true,
});
