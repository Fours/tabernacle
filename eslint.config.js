// ESLint flat config. Run with `npm run lint`.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Keep modules small enough for a sub-agent to read in one go. Counts lines of code:
      // blank lines and comments don't count.
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
];
