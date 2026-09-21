module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.js', 'jest.config.js'],
  rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
};
