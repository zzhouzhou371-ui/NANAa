import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(resolve(root, path), 'utf8');
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const themeSource = read('src/services/theme.ts');
const defaultsSource = read('src/constants/defaults.ts');
const storeSource = read('src/stores/nanaStore.ts');
const homeSource = read('src/screens/home/index.tsx');

const iconOptions = themeSource.slice(
  themeSource.indexOf('export const ICON_PACK_OPTIONS'),
  themeSource.indexOf('export const CHROME_STYLE_OPTIONS'),
);
const chromeOptions = themeSource.slice(
  themeSource.indexOf('export const CHROME_STYLE_OPTIONS'),
  themeSource.indexOf('const WALLPAPER_IDS'),
);
const normalizeThemeStart = storeSource.indexOf('const normalizeThemeConfig');
const normalizeThemeEnd = storeSource.indexOf('export function migrateNanaPersistedState');
const normalizeThemeSource = storeSource.slice(normalizeThemeStart, normalizeThemeEnd);

expect(
  !iconOptions.includes("id: 'system'") && iconOptions.includes("id: 'neumorphic-v1'"),
  'Theme UI must expose only the Kuromi neumorphic icon pack',
);
expect(
  !chromeOptions.includes("{ id: 'system' }") && chromeOptions.includes("{ id: 'neumorphic-v1' }"),
  'Theme UI must expose only the neumorphic phone chrome',
);
expect(
  defaultsSource.includes("iconStyle: 'neumorphic-v1'") && defaultsSource.includes("chromeStyle: 'neumorphic-v1'"),
  'new installs must default to the sole supported visual theme',
);
expect(
  normalizeThemeSource.includes("iconStyle: 'neumorphic-v1'")
    && normalizeThemeSource.includes("chromeStyle: 'neumorphic-v1'"),
  'persisted legacy theme selections must migrate to the sole supported theme',
);
expect(
  !homeSource.includes('systemAssetPreview'),
  'the home screen must not bundle the retired Nana icon pack previews',
);

if (errors.length > 0) {
  console.error('Theme contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Theme contract check passed.');
}
