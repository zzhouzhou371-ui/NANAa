import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');
const errors = [];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

const bannedMotion = [
  ['withSpring(', 'withSpring'],
  ['.springify(', 'springify'],
  ["type: 'spring'", "type: 'spring'"],
  ['type: "spring"', 'type: "spring"'],
  ['BounceIn', 'BounceIn'],
  ['BounceOut', 'BounceOut'],
];

for (const file of sourceFiles(sourceRoot)) {
  const source = readFileSync(file, 'utf8');
  for (const [needle, label] of bannedMotion) {
    if (source.includes(needle)) {
      errors.push(`${relative(root, file)} still uses ${label}`);
    }
  }
  if (/transition=\{[1-9][0-9]*\}/.test(source)) {
    errors.push(`${relative(root, file)} still uses a numeric image/content cross-dissolve`);
  }
}

const primitives = readFileSync(resolve(sourceRoot, 'components/primitives.tsx'), 'utf8');
if (!primitives.includes('withTiming(') || primitives.includes('const [pressed, setPressed] = useState(false)')) {
  errors.push('shared press feedback must run as bounded UI-thread timing without React press-state rerenders');
}
if (primitives.includes('pressed && !disabled ? 0.85 : 1')) {
  errors.push('shared press feedback must not fade controls while they are pressed');
}
if (!primitives.includes('Math.max(0.97, Math.min(1, scale))')) {
  errors.push('shared press feedback must clamp legacy aggressive scale values to a subtle range');
}

const callOverlay = readFileSync(resolve(sourceRoot, 'components/CallOverlay.tsx'), 'utf8');
if (callOverlay.includes('from={{ opacity: 0 }}') || callOverlay.includes('exit={{ opacity: 0 }}')) {
  errors.push('call overlay state changes must use spatial timing instead of fade transitions');
}

const phoneStatusBar = readFileSync(resolve(sourceRoot, 'components/system/PhoneStatusBar.tsx'), 'utf8');
if (phoneStatusBar.includes('opacity: islandExpanded')) {
  errors.push('status bar must move clear of the expanded island instead of fading');
}

const homeShell = readFileSync(resolve(sourceRoot, 'screens/home/index.tsx'), 'utf8');
if (homeShell.includes('animate={{ paddingTop:') || homeShell.includes('from={{ paddingTop:')) {
  errors.push('the phone shell must not animate layout-driving top padding');
}
if (!homeShell.includes('getPhoneShellTopPadding({') || !homeShell.includes('dynamicIslandVisible: !isMeeting')) {
  errors.push('the phone shell must reserve stable safe-area space for Meeting and the dynamic island');
}

const stableViewport = readFileSync(resolve(sourceRoot, 'hooks/useStableViewportMetrics.ts'), 'utf8');
if (!stableViewport.includes("Dimensions.get('screen').height") || !stableViewport.includes("Platform.OS === 'web'")) {
  errors.push('native compact breakpoints must stay stable while the Android keyboard resizes the window');
}

const meetingView = readFileSync(resolve(sourceRoot, 'features/meeting/ui/meeting-view.tsx'), 'utf8');
const chatView = readFileSync(resolve(sourceRoot, 'components/ChatView.tsx'), 'utf8');
if (!meetingView.includes('useStableViewportMetrics()') || !chatView.includes('useStableViewportMetrics()')) {
  errors.push('Meeting and chat must use keyboard-stable native compact breakpoints');
}

const rootLayout = readFileSync(resolve(sourceRoot, 'app/_layout.tsx'), 'utf8');
if (!rootLayout.includes('SafeAreaProvider initialMetrics={initialWindowMetrics}')) {
  errors.push('the native safe area must be available on the first rendered frame');
}

if (errors.length > 0) {
  console.error('Motion contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Motion contract passed.');
}
