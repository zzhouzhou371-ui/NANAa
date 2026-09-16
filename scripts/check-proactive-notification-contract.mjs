import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageJson = JSON.parse(read('package.json'));
const appConfig = JSON.parse(read('app.json'));
const runtime = read('src/services/proactiveNotificationRuntime.native.ts');
const webRuntime = read('src/services/proactiveNotificationRuntime.web.ts');
const layout = read('src/app/_layout.tsx');
const settings = read('src/components/SettingsView.tsx');
const store = read('src/stores/nanaStore.ts');
const storage = read('src/services/storage.ts');

expect(
  packageJson.dependencies['expo-notifications'] === '~55.0.25',
  'the notification runtime must use the Expo SDK 55 compatible module',
);
expect(
  appConfig.expo.plugins.some(plugin => plugin === 'expo-notifications'),
  'the native notification config plugin must be registered',
);
expect(
  runtime.includes("PROACTIVE_NOTIFICATION_KIND = 'nana-proactive-chat'"),
  'relationship reminders need a private notification identity',
);
expect(
  runtime.includes('getAllScheduledNotificationsAsync')
    && runtime.includes('cancelScheduledNotificationAsync'),
  'rescheduling must cancel only prior Nana relationship reminders',
);
expect(
  runtime.includes('selectNextProactiveNotificationPlan')
    && runtime.includes('PROACTIVE_GLOBAL_COOLDOWN_MS')
    && runtime.includes("resolveChatPresence(characterId, dueAt) !== 'resting'"),
  'notification planning must preserve anti-burst and resting rules',
);
expect(
  runtime.includes('requestProactiveNotificationPermission')
    && settings.includes('requestProactiveNotificationPermission()'),
  'notification permission must be requested from an explicit user action',
);
expect(
  !layout.includes('requestProactiveNotificationPermission'),
  'app startup must never prompt for notification permission',
);
expect(
  runtime.includes('scheduleNotificationAsync')
    && runtime.includes('SchedulableTriggerInputTypes.TIME_INTERVAL'),
  'the runtime must schedule a local inexact reminder without exact-alarm permission',
);
expect(
  runtime.includes("PROACTIVE_NOTIFICATION_CHANNEL_ID = 'relationship-messages-v2'")
    && runtime.includes('AndroidImportance.HIGH')
    && runtime.includes('AndroidNotificationPriority.HIGH'),
  'background relationship messages must use a fresh high-visibility Android channel',
);
expect(
  runtime.includes('createLocalProactiveMessage({')
    && runtime.includes('body: plan.previewText')
    && runtime.includes("sound: 'default'"),
  'closed-app notifications must show a persona-shaped local message instead of a generic reminder',
);
expect(
  !layout.includes('dismissPresentedProactiveNotifications'),
  'opening Nana from the launcher must not erase an unread relationship notification',
);
expect(
  !runtime.includes('fetch(')
    && !runtime.includes('generateProactiveReply')
    && settings.includes('proactiveNotificationsCostPolicy'),
  'closed-app reminders must not call a model or hide the cost policy',
);
expect(
  !webRuntime.includes('expo-notifications')
    && webRuntime.includes("'unavailable'"),
  'web previews must not load the native notification module',
);
expect(
  layout.includes('observeProactiveNotificationResponses')
    && layout.includes("activeApp: 'wechat'")
    && layout.includes("weChatPage: 'chat'"),
  'tapping a relationship reminder must open the intended in-phone chat',
);
expect(
  store.includes('proactiveNotificationsEnabled: false')
    && store.includes('state.proactiveNotificationsEnabled === true')
    && storage.includes("'proactiveNotificationsEnabled'"),
  'system reminders must be an opt-in, normalized, portable preference',
);

console.log('Proactive notification contract checks passed.');
