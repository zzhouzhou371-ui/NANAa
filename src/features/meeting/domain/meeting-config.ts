import {
  MEETING_SCHEMA_VERSION,
  type MeetingConfig,
  type MeetingHtmlTemplateConfig,
  type MeetingMiniTheaterMode,
  type MeetingPresetSnapshot,
  type MeetingStatusFieldConfig,
  type MeetingStatusSnapshot,
  type MeetingStatusUpdate,
} from './meeting-types';
import { sanitizeMeetingCss, sanitizeMeetingHtml } from './meeting-parser';
import {
  DEFAULT_MEETING_NARRATIVE_CONFIG,
  normalizeMeetingNarrativeConfig,
} from './meeting-narrative';

export {
  DEFAULT_MEETING_NARRATIVE_CONFIG,
  normalizeMeetingNarrativeConfig,
} from './meeting-narrative';

export type {
  MeetingConfig,
  MeetingHtmlTemplateConfig,
  MeetingMiniTheaterConfig,
  MeetingMiniTheaterMode,
  MeetingNarrativeConfig,
  MeetingPresetSnapshot,
  MeetingStatusFieldConfig,
} from './meeting-types';

export const MEETING_TEMPLATE_MIN_HEIGHT = 72;
export const MEETING_TEMPLATE_MAX_HEIGHT = 480;

const DEFAULT_STATUS_TEMPLATE: MeetingHtmlTemplateConfig = {
  height: 156,
  html: [
    '<section class="meeting-status">',
    '<header>{{user.name}} · 见面状态</header>',
    '<p><b>地点</b><span>{{scene.location}}</span></p>',
    '<p><b>气氛</b><span>{{scene.atmosphere}}</span></p>',
    '<div class="cast">',
    '<p class="character"><b>{{character1.name}}</b><span>{{character1.emotion}}</span></p>',
    '<p class="character"><b>{{character2.name}}</b><span>{{character2.emotion}}</span></p>',
    '<p class="character"><b>{{character3.name}}</b><span>{{character3.emotion}}</span></p>',
    '<p class="character"><b>{{character4.name}}</b><span>{{character4.emotion}}</span></p>',
    '</div>',
    '</section>',
  ].join(''),
  css: [
    '.meeting-status{height:100%;padding:14px 16px;border-radius:20px;background:rgba(255,250,255,.9);color:#382d41}',
    '.meeting-status header{font-weight:750;margin-bottom:8px}',
    '.meeting-status p{display:flex;justify-content:space-between;gap:12px;margin:5px 0;font-size:13px}',
    '.meeting-status b{color:#795d7e}.meeting-status span{text-align:right}',
    '.meeting-status .cast{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px}',
    '.meeting-status .character:has(b:empty){display:none}',
  ].join(''),
};

const DEFAULT_MINI_THEATER = {
  mode: 'off' as MeetingMiniTheaterMode,
  prompt: 'Only when requested, write one brief cinematic aside grounded in this turn. Do not invent a new event.',
  height: 184,
  html: '<article class="mini-theater"><h3>{{title}}</h3><p>{{content}}</p></article>',
  css: [
    '.mini-theater{height:100%;padding:18px;border-radius:22px;background:linear-gradient(145deg,#fff8fd,#eee8ff);color:#392f42}',
    '.mini-theater h3{margin:0 0 10px;font-size:16px}.mini-theater p{margin:0;line-height:1.6;white-space:pre-wrap}',
  ].join(''),
};

export const DEFAULT_MEETING_CONFIG: MeetingConfig = {
  schemaVersion: MEETING_SCHEMA_VERSION,
  statusFields: {
    scene: [
      { key: 'location', label: '地点', initialValue: '未定' },
      { key: 'atmosphere', label: '气氛', initialValue: '平静' },
    ],
    character: [
      { key: 'emotion', label: '情绪', initialValue: '平静' },
      { key: 'position', label: '位置', initialValue: '场景中' },
    ],
  },
  statusTemplate: DEFAULT_STATUS_TEMPLATE,
  miniTheater: DEFAULT_MINI_THEATER,
  narrative: DEFAULT_MEETING_NARRATIVE_CONFIG,
};

const recordOf = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const compactText = (value: unknown, maxLength: number, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const text = Array.from(value.replace(/\u0000/gu, '').trim()).slice(0, maxLength).join('');
  return text || fallback;
};

const normalizeHeight = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(MEETING_TEMPLATE_MIN_HEIGHT, Math.min(MEETING_TEMPLATE_MAX_HEIGHT, value)));
};

const normalizeField = (value: unknown): MeetingStatusFieldConfig | undefined => {
  const record = recordOf(value);
  const key = compactText(record?.key, 40);
  if (!/^[a-z][a-zA-Z0-9_-]*$/u.test(key)) return undefined;
  const label = compactText(record?.label, 40);
  if (!label) return undefined;
  return {
    key,
    label,
    initialValue: compactText(record?.initialValue, 120, '—'),
  };
};

const normalizeFields = (
  value: unknown,
  fallback: readonly MeetingStatusFieldConfig[],
) => {
  if (!Array.isArray(value)) return fallback.map(field => ({ ...field }));
  const keys = new Set<string>();
  return value.slice(0, 16).flatMap(entry => {
    const field = normalizeField(entry);
    if (!field || keys.has(field.key)) return [];
    keys.add(field.key);
    return [field];
  });
};

const normalizeTemplate = (
  value: unknown,
  fallback: MeetingHtmlTemplateConfig,
): MeetingHtmlTemplateConfig => {
  const record = recordOf(value);
  const html = typeof record?.html === 'string'
    ? sanitizeMeetingHtml(record.html).slice(0, 12_000)
    : fallback.html;
  const css = typeof record?.css === 'string'
    ? sanitizeMeetingCss(record.css).slice(0, 12_000)
    : fallback.css;
  return {
    html: html || fallback.html,
    css,
    height: normalizeHeight(record?.height, fallback.height),
  };
};

export const normalizeMeetingConfig = (value: unknown): MeetingConfig => {
  const record = recordOf(value);
  const fields = recordOf(record?.statusFields);
  const theater = recordOf(record?.miniTheater);
  const normalizedTheaterTemplate = normalizeTemplate(theater, DEFAULT_MINI_THEATER);
  const mode = theater?.mode === 'manual' || theater?.mode === 'everyTurn' || theater?.mode === 'off'
    ? theater.mode
    : DEFAULT_MINI_THEATER.mode;
  return {
    schemaVersion: MEETING_SCHEMA_VERSION,
    statusFields: {
      scene: normalizeFields(fields?.scene, DEFAULT_MEETING_CONFIG.statusFields.scene),
      character: normalizeFields(fields?.character, DEFAULT_MEETING_CONFIG.statusFields.character),
    },
    statusTemplate: normalizeTemplate(record?.statusTemplate, DEFAULT_STATUS_TEMPLATE),
    miniTheater: {
      ...normalizedTheaterTemplate,
      mode,
      prompt: compactText(theater?.prompt, 2_000, DEFAULT_MINI_THEATER.prompt),
    },
    narrative: normalizeMeetingNarrativeConfig(record?.narrative),
  };
};

export interface CreateMeetingPresetSnapshotInput {
  sourcePresetId: string;
  name: string;
  prompt: string;
  meetingConfig?: unknown;
}

export const createMeetingPresetSnapshot = (
  input: CreateMeetingPresetSnapshotInput,
): MeetingPresetSnapshot => ({
  schemaVersion: MEETING_SCHEMA_VERSION,
  sourcePresetId: compactText(input.sourcePresetId, 160, 'meeting-preset'),
  name: compactText(input.name, 120, '见面预设'),
  prompt: compactText(input.prompt, 12_000),
  meetingConfig: normalizeMeetingConfig(input.meetingConfig),
});

export const createInitialMeetingStatus = (
  config: MeetingConfig,
  castIds: readonly string[],
): MeetingStatusSnapshot => ({
  scene: Object.fromEntries(config.statusFields.scene.map(field => [field.key, field.initialValue])),
  characters: Object.fromEntries([...new Set(castIds)].map(characterId => [characterId, {
    characterId,
    values: Object.fromEntries(config.statusFields.character.map(field => [field.key, field.initialValue])),
  }])),
});

export const normalizeMeetingStatusSnapshot = (
  value: unknown,
  config: MeetingConfig,
  castIds: readonly string[],
): MeetingStatusSnapshot => {
  const initial = createInitialMeetingStatus(config, castIds);
  const root = recordOf(value);
  const scene = recordOf(root?.scene);
  for (const field of config.statusFields.scene) {
    initial.scene[field.key] = compactText(scene?.[field.key], 120, field.initialValue);
  }
  const characters = recordOf(root?.characters);
  for (const characterId of Object.keys(initial.characters)) {
    const rawCharacter = recordOf(characters?.[characterId]);
    const rawValues = recordOf(rawCharacter?.values) || rawCharacter;
    for (const field of config.statusFields.character) {
      initial.characters[characterId].values[field.key] = compactText(
        rawValues?.[field.key],
        120,
        field.initialValue,
      );
    }
  }
  return initial;
};

export const applyMeetingStatusUpdates = (
  current: MeetingStatusSnapshot,
  updates: readonly MeetingStatusUpdate[],
  config: MeetingConfig,
  castIds: readonly string[],
) => {
  const next = normalizeMeetingStatusSnapshot(current, config, castIds);
  const sceneKeys = new Set(config.statusFields.scene.map(field => field.key));
  const characterKeys = new Set(config.statusFields.character.map(field => field.key));
  for (const update of updates) {
    if (!update.value.trim() || Array.from(update.value.trim()).length > 120) continue;
    if (update.scope === 'scene' && sceneKeys.has(update.key)) {
      next.scene[update.key] = update.value.trim();
    } else if (
      update.scope === 'character'
      && update.characterId
      && characterKeys.has(update.key)
      && next.characters[update.characterId]
    ) {
      next.characters[update.characterId].values[update.key] = update.value.trim();
    }
  }
  return next;
};
