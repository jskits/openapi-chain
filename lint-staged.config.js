import path from 'node:path';

const isScopedGenerated = (file) =>
  path
    .relative(process.cwd(), file)
    .split(path.sep)
    .join('/')
    .startsWith('examples/scoped/generated/');

export default {
  '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': (files) => {
    const targets = files.filter((file) => !isScopedGenerated(file));
    const args = targets.map((file) => JSON.stringify(file)).join(' ');
    return targets.length ? [`oxlint --fix --deny-warnings ${args}`, `oxfmt --write ${args}`] : [];
  },
  '*.{json,jsonc,yaml,yml,md,css,scss,html}': (files) => {
    const targets = files.filter((file) => {
      if (isScopedGenerated(file)) return false;
      const relative = path.relative(process.cwd(), file).split(path.sep).join('/');
      return !/^(?:\.changeset\/[^/]+\.md|(?:packages\/[^/]+\/)?CHANGELOG\.md|pnpm-lock\.yaml)$/.test(
        relative,
      );
    });
    return targets.length
      ? `oxfmt --write ${targets.map((file) => JSON.stringify(file)).join(' ')}`
      : [];
  },
};
