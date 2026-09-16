import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'src/components/SettingsView.tsx'), 'utf8');
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

expect(
  source.includes('function SettingsStatus({')
    && source.includes('testID="settings-api-status-slot"')
    && source.includes('testID="settings-voice-status-slot"'),
  'settings save feedback must render inside stable reserved status slots',
);
expect(
  source.includes('accessibilityLiveRegion="polite"'),
  'settings save feedback must announce success without opening a blocking modal',
);
expect(
  !source.includes("Alert.alert('API Settings', status)")
    && !source.includes('if (showAlert) Alert.alert(t.voiceService, t.voiceSettingsSaved)'),
  'successful settings saves must not animate a modal over the form',
);

if (errors.length > 0) {
  console.error('Settings stability contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Settings stability contract passed.');
}
