import path from 'node:path';

export default {
  '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['oxlint --fix --deny-warnings', 'oxfmt --write'],
  '*.{json,jsonc,yaml,yml,md,css,scss,html}': (files) => {
    const targets = files.filter((file) => {
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
