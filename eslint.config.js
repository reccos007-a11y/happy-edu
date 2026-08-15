// Единый конфиг на весь репозиторий: у backend и frontend разные окружения,
// поэтому глобальные переменные и парсер задаются отдельно для каждого.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
  },

  js.configs.recommended,

  {
    name: 'backend',
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Неиспользованный аргумент — обычное дело в middleware Express
      // (_req, _next), поэтому подчёркивание выводит его из-под правила.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  ...vue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['frontend/**/*.{js,vue}'],
  })),

  {
    name: 'frontend',
    files: ['frontend/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Идёт последним: снимает правила, которые спорят с форматированием Prettier.
  prettier,
];
