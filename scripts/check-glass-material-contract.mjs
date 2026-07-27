import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');
const glassModulePath = resolve(sourceRoot, 'components/thick-glass-surface.tsx');
const glassModule = readFileSync(glassModulePath, 'utf8');
const appEntryPath = resolve(sourceRoot, 'screens/home/index.tsx');
const appEntry = readFileSync(appEntryPath, 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const allowedVariants = ['row', 'sheet', 'input', 'nav', 'action'];
const allowedTints = ['pearl', 'peach', 'apricot'];
const errors = [];
const notes = [];
const variantCounts = Object.fromEntries(allowedVariants.map(variant => [variant, 0]));

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/');
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function literalProp(openingTag, prop) {
  const match = openingTag.match(new RegExp(`\\b${prop}\\s*=\\s*["']([^"']+)["']`));
  return match?.[1] ?? null;
}

function hasBooleanProp(openingTag, prop) {
  return new RegExp(`\\b${prop}(?:\\s*=|\\s|/?>)`).test(openingTag);
}

function balancedObject(source, openingBrace) {
  let quote = null;
  let escaped = false;
  let braces = 0;

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') braces += 1;
    else if (character === '}') {
      braces -= 1;
      if (braces === 0) return source.slice(openingBrace, index + 1);
    }
  }

  return null;
}

function assignedObject(source, assignmentPattern) {
  const match = assignmentPattern.exec(source);
  if (!match) return null;
  const openingBrace = source.indexOf('{', match.index + match[0].length);
  return openingBrace === -1 ? null : balancedObject(source, openingBrace);
}

function namedObject(source, name) {
  const match = new RegExp(`\\b${name}\\s*:\\s*\\{`).exec(source);
  if (!match) return null;
  const openingBrace = source.indexOf('{', match.index);
  return balancedObject(source, openingBrace);
}

function openingTags(source, component) {
  const tags = [];
  const needle = `<${component}`;
  let cursor = 0;

  while ((cursor = source.indexOf(needle, cursor)) !== -1) {
    const boundary = source[cursor + needle.length];
    if (boundary && !/[\s/>]/.test(boundary)) {
      cursor += needle.length;
      continue;
    }

    let quote = null;
    let braces = 0;
    let escaped = false;
    let end = cursor + needle.length;

    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }

      if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{') braces += 1;
      else if (character === '}') braces = Math.max(0, braces - 1);
      else if (character === '>' && braces === 0) break;
    }

    if (end >= source.length) {
      errors.push(`${component} has an unterminated opening tag at line ${lineAt(source, cursor)}`);
      break;
    }

    tags.push({ index: cursor, end: end + 1, text: source.slice(cursor, end + 1) });
    cursor = end + 1;
  }

  return tags;
}

function sharedContainerBodies(source) {
  const bodies = [];
  const openings = openingTags(source, 'ThickGlassContainer');
  const closeTag = '</ThickGlassContainer>';

  for (const opening of openings) {
    const close = source.indexOf(closeTag, opening.end);
    if (close === -1) {
      errors.push(`ThickGlassContainer has no closing tag at line ${lineAt(source, opening.index)}`);
      continue;
    }
    bodies.push({ opening, body: source.slice(opening.end, close) });
  }

  return bodies;
}

const declaredVariantMatch = glassModule.match(
  /export type ThickGlassVariant\s*=\s*([^;]+);/,
);
const declaredVariants = declaredVariantMatch?.[1].match(/'([^']+)'/g)
  ?.map(value => value.slice(1, -1)) ?? [];

expect(
  JSON.stringify(declaredVariants) === JSON.stringify(allowedVariants),
  `src/components/thick-glass-surface.tsx must keep the reviewed variants: ${allowedVariants.join(', ')}`,
);
expect(
  /^~55\.0\.\d+$/.test(packageJson.dependencies?.['expo-blur'] ?? ''),
  'package.json must declare the Expo SDK 55 expo-blur dependency',
);
expect(
  /^55\.0\.\d+$/.test(
    packageLock.packages?.['node_modules/expo-blur']?.version ?? '',
  ),
  'package-lock.json must resolve expo-blur to an SDK 55 release',
);
expect(
  /import\s*\{[\s\S]*?\bBlurTargetView\b[\s\S]*?\bBlurView\b[\s\S]*?\}\s*from\s*['"]expo-blur['"]/.test(glassModule),
  'the base material must import BlurTargetView and BlurView from expo-blur',
);
expect(
  /const AndroidBlurTargetContext\s*=\s*createContext<RefObject<View \| null> \| null>/.test(glassModule),
  'Android blur must use one typed target context instead of per-surface targets',
);
expect(
  glassModule.includes('<AndroidBlurTargetContext.Provider value={blurTarget}>'),
  'ThickGlassBackdropProvider must publish the shared Android blur target ref',
);
expect(
  /Platform\.OS === 'android'\s*&&\s*blurTarget[\s\S]*?<BlurTargetView ref=\{blurTarget\}/.test(glassModule),
  'ThickGlassBackdropTarget must render BlurTargetView on Android with the shared ref',
);
expect(
  openingTags(appEntry, 'ThickGlassBackdropProvider').length === 1 &&
    openingTags(appEntry, 'ThickGlassBackdropTarget').length === 1,
  'the app shell must mount exactly one ThickGlassBackdropProvider and one ThickGlassBackdropTarget',
);
expect(
  /<ThickGlassBackdropProvider>[\s\S]*?<ThickGlassBackdropTarget[\s\S]*?<AmbientBackground\s*\/>[\s\S]*?<\/ThickGlassBackdropTarget>[\s\S]*?<AppOverlay\s*\/>[\s\S]*?<\/ThickGlassBackdropProvider>/.test(appEntry),
  'the app shell blur target must wrap AmbientBackground behind the UI and AppOverlay',
);
expect(
  /Platform\.OS === 'android'\s*&&\s*!reduced\s*&&\s*blurTarget !== null/.test(glassModule),
  'Android blur must require a provider target and respect reduced transparency',
);

const blurMethods = [...glassModule.matchAll(/blurMethod\s*=\s*["']([^"']+)["']/g)]
  .map(match => match[1]);
expect(blurMethods.length > 0, 'MaterialLayers must configure an Android BlurView method');
expect(
  blurMethods.every(method => method !== 'none'),
  'Android BlurView must not use blurMethod="none"',
);
expect(
  blurMethods.includes('dimezisBlurViewSdk31Plus'),
  'Android BlurView must use dimezisBlurViewSdk31Plus to avoid the SDK 30 performance path',
);
expect(
  /<BlurView[\s\S]*?blurTarget=\{blurTarget\}[\s\S]*?blurReductionFactor=\{variantSpec\.blurReductionFactor\}[\s\S]*?intensity=\{variantSpec\.blurIntensity\}[\s\S]*?tint=\{variantSpec\.blurTint\}/.test(glassModule),
  'BlurView target, reduction, intensity, and tint must come from the shared material architecture',
);

const variantTable = assignedObject(
  glassModule,
  /const variantSpecs:\s*Record<ThickGlassVariant, ThickGlassVariantSpec>\s*=/,
);
expect(Boolean(variantTable), 'all five variants must live in the typed variantSpecs table');

const requiredVariantFields = [
  'radius',
  'surface',
  'content',
  'glassEffectStyle',
  'nativeInteractive',
  'blurIntensity',
  'blurReductionFactor',
  'blurTint',
  'tintOpacity',
  'lightOpacity',
  'depthOpacity',
  'outlineOpacity',
  'shadow',
];

if (variantTable) {
  for (const variant of allowedVariants) {
    const block = namedObject(variantTable, variant);
    expect(Boolean(block), `variantSpecs must define variant="${variant}"`);
    for (const field of requiredVariantFields) {
      expect(
        Boolean(block && new RegExp(`\\b${field}\\s*:`).test(block)),
        `variantSpecs.${variant} must define ${field}`,
      );
    }
  }
}

const toneTable = assignedObject(
  glassModule,
  /const toneSpecs:\s*Record<ThickGlassTint, ThickGlassToneSpec>\s*=/,
);
expect(Boolean(toneTable), 'all tint families must live in the typed toneSpecs table');
if (toneTable) {
  for (const tint of allowedTints) {
    const block = namedObject(toneTable, tint);
    expect(Boolean(block), `toneSpecs must define tint="${tint}"`);
    for (const field of ['tint', 'highlight', 'depth', 'reduced', 'strength']) {
      expect(
        Boolean(block && new RegExp(`\\b${field}\\s*:`).test(block)),
        `toneSpecs.${tint} must define ${field}`,
      );
    }
  }
}

expect(
  /function resolveMaterial\([\s\S]*?variantSpecs\[variant\][\s\S]*?toneSpecs\[tint\][\s\S]*?base:[\s\S]*?lighting:[\s\S]*?depth:[\s\S]*?outline:/.test(glassModule),
  'resolveMaterial must derive tint, highlight, depth, and outline from variantSpecs plus toneSpecs',
);
expect(
  /function MaterialLayers\([\s\S]*?<BlurView[\s\S]*?backgroundColor:[\s\S]*?material\.base[\s\S]*?colors=\{material\.lighting\}[\s\S]*?colors=\{material\.depth\}[\s\S]*?material\.outline/.test(glassModule),
  'MaterialLayers must render blur, tint, highlight, depth, and outline in one shared layer stack',
);
expect(
  /<MaterialLayers[\s\S]*?variant=\{variant\}[\s\S]*?tint=\{tint\}/.test(glassModule),
  'ThickGlassSurface must delegate fallback material rendering to MaterialLayers',
);
expect(
  /<View style=\{\[styles\.content, variantSpec\.content, contentStyle\]\}>/.test(glassModule) &&
    /content:\s*\{[\s\S]*?zIndex:\s*1/.test(glassModule),
  'content must remain above the material stack and use the same variantSpec table',
);

const files = sourceFiles(sourceRoot);
let surfaceCount = 0;
let containerCount = 0;
let inheritedSurfaceCount = 0;
let legacyGlassCardConsumerCount = 0;

for (const path of files) {
  const source = path === glassModulePath ? glassModule : readFileSync(path, 'utf8');
  const file = displayPath(path);

  if (path !== glassModulePath && source.includes('expo-glass-effect')) {
    errors.push(`${file}: import expo-glass-effect only through thick-glass-surface.tsx`);
  }
  if (path !== glassModulePath && source.includes('expo-blur')) {
    errors.push(`${file}: import expo-blur only through thick-glass-surface.tsx`);
  }

  if (/from\s+["']\.\/GlassCard["']|from\s+["']\.\.\/components\/GlassCard["']/.test(source)) {
    legacyGlassCardConsumerCount += 1;
  }

  if (path === glassModulePath) continue;

  const surfaces = openingTags(source, 'ThickGlassSurface');
  surfaceCount += surfaces.length;

  for (const surface of surfaces) {
    const location = `${file}:${lineAt(source, surface.index)}`;
    const variant = literalProp(surface.text, 'variant');
    const tint = literalProp(surface.text, 'tint');

    if (!variant) errors.push(`${location}: ThickGlassSurface needs an explicit literal variant`);
    else if (!allowedVariants.includes(variant)) errors.push(`${location}: unsupported variant "${variant}"`);
    else variantCounts[variant] += 1;

    if (!tint) errors.push(`${location}: ThickGlassSurface needs an explicit literal tint`);
    else if (!allowedTints.includes(tint)) errors.push(`${location}: unsupported tint "${tint}"`);

    if (hasBooleanProp(surface.text, 'sharedMaterial')) {
      errors.push(`${location}: use inheritMaterial; the ThickGlassSurface sharedMaterial alias is compatibility-only`);
    }
    if (hasBooleanProp(surface.text, 'inheritMaterial')) inheritedSurfaceCount += 1;
  }

  for (const container of sharedContainerBodies(source)) {
    containerCount += 1;
    const location = `${file}:${lineAt(source, container.opening.index)}`;
    const material = literalProp(container.opening.text, 'sharedMaterial');
    if (!material) {
      notes.push(`${location}: container has no shared fallback material; it only groups native glass effects`);
      continue;
    }

    const descendants = openingTags(container.body, 'ThickGlassSurface');
    for (const descendant of descendants) {
      const tint = literalProp(descendant.text, 'tint');
      const inherits = hasBooleanProp(descendant.text, 'inheritMaterial');
      const descendantLine = lineAt(source, container.opening.end + descendant.index);
      if (tint === material && !inherits) {
        errors.push(`${file}:${descendantLine}: ${tint} surface inside shared ${material} container must set inheritMaterial`);
      } else if (tint && tint !== material && !inherits) {
        notes.push(`${file}:${descendantLine}: ${tint} surface intentionally stays a separate material inside shared ${material} container; review if the group should become optically continuous`);
      }
    }
  }
}

for (const variant of allowedVariants) {
  if (variantCounts[variant] === 0) {
    notes.push(
      `no current business surface exercises variant="${variant}"; the base table is checked, but runtime coverage is pending`,
    );
  }
}

console.log(
  `Glass material coverage: ${surfaceCount} surfaces, ${containerCount} containers, ` +
  `${inheritedSurfaceCount} inherited surfaces.`,
);
console.log(
  `Variants: ${allowedVariants.map(variant => `${variant}=${variantCounts[variant]}`).join(', ')}.`,
);

if (legacyGlassCardConsumerCount > 0) {
  const legacyBridgePath = resolve(sourceRoot, 'components', 'GlassCard.tsx');
  const legacyBridge = readFileSync(legacyBridgePath, 'utf8');
  expect(
    /<ThickGlassSurface[\s\S]*?variant=["']sheet["'][\s\S]*?tint=["']pearl["']/.test(legacyBridge),
    'GlassCard compatibility wrapper must delegate legacy consumers to the shared ThickGlassSurface material',
  );
  console.log(
    `GlassCard bridge: ${legacyGlassCardConsumerCount} legacy consumer files inherit the shared sheet material.`,
  );
}

if (notes.length > 0) {
  console.warn('Glass material review notes:');
  for (const note of notes) console.warn(`- ${note}`);
}

if (errors.length > 0) {
  console.error('Glass material contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Glass material contract passed.');
}
