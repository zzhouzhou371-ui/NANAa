const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: [
      '.expo/**',
      'dist/**',
      'dist-test/**',
      'web-build/**',
      'web-export*/**',
      'screenshots/**',
      'assets/3d/**',
      'assets/generated/**',
      'assets/references/**',
      'coverage/**',
      'expo-web*.log',
      'nana-*.png',
      'wechat-*.png',
    ],
  },
  expoConfig,
]);
