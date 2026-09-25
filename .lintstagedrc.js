module.exports = {
  '*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    () => 'tsc --noEmit', // Type check all files
  ],
  '*.{json,md,css}': ['prettier --write'],
}
