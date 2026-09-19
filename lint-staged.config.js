export default {
  '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['oxlint --fix --deny-warnings', 'oxfmt --write'],
  '*.{json,jsonc,yaml,yml,md,css,scss,html}': 'oxfmt --write',
};
