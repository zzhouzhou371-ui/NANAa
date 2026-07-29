import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readSource = path => readFileSync(resolve(root, path), 'utf8');
const homeSource = readSource('src/screens/home/index.tsx');
const weatherSource = readSource('src/components/system/HomeWeatherWidget.tsx');
const skySource = readSource('src/components/system/SkyScene.tsx');
const bubbleSource = readSource('src/components/ChatMessageBubble.tsx');
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

expect(
  homeSource.includes("AppState.addEventListener('change', setAppState)"),
  'the simulated phone shell must react to native foreground/background changes',
);
expect(
  homeSource.includes('const desktopRuntimeActive = appStateActive && !activeApp'),
  'desktop work must pause whenever a built-in app is open or Nana is not active',
);
expect(
  homeSource.includes('<DesktopRuntimeActivityContext.Provider value={desktopRuntimeActive}>')
    && homeSource.includes('<AmbientBackground />')
    && homeSource.includes('<HomeWeatherWidget active={desktopRuntimeActive} compact={compactGrid} />'),
  'the shell must share one desktop activity boundary with the sky and weather widget',
);
expect(
  /if \(!active\) return undefined;[\s\S]*setInterval\(/.test(weatherSource),
  'weather clock updates must not schedule an interval while the desktop is inactive',
);
expect(
  /loop: !motionDisabled/.test(weatherSource),
  'weather glyph loops must be disabled while the desktop is inactive',
);
expect(
  /function useLocalHour\(active: boolean\)[\s\S]*if \(!active\) return undefined;[\s\S]*setInterval\(/.test(skySource),
  'sky phase updates must not schedule an interval while the desktop is inactive',
);
expect(
  skySource.includes("const staticScene = reducedMotion || Platform.OS === 'android' || !active"),
  'the sky must become static without unmounting when the desktop is inactive',
);
expect(
  homeSource.includes('pointerEvents={activeApp ? \'none\' : \'auto\'}')
    && homeSource.includes('APPS.map((app) =>')
    && !/activeApp\s*\?\s*null\s*:\s*<HomeWeatherWidget/.test(homeSource),
  'the launcher and its icons must remain mounted behind an active app',
);
expect(
  !homeSource.includes('const chatHistory = useNanaStore(s => s.chatHistory)')
    && homeSource.includes('s.chatHistory[activeChatId]')
    && !homeSource.includes('[...activeMessages].reverse()'),
  'AppOverlay must subscribe only to the active history and scan it without reverse allocation',
);
expect(
  bubbleSource.includes('useNanaStore(state => state.selectedMsgIds.includes(msg.id))')
    && !bubbleSource.includes('useNanaStore(state => state.selectedMsgIds);'),
  'each chat bubble must subscribe only to its own selected state',
);

if (errors.length > 0) {
  console.error('Foreground performance contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Foreground performance contract passed.');
}
