import { normalizeMeetingConfig } from './meeting-config';
import type {
  MeetingConfig,
  MeetingMiniTheaterMode,
  MeetingNarrationPerson,
} from './meeting-types';

export interface MeetingPresetRuleSummaryItem {
  id: 'style' | 'length' | 'viewpoint' | 'layout' | 'leadQuote' | 'theater' | 'status' | 'restrictions';
  label: string;
  value: string;
}

export interface MeetingPresetTrialResult {
  source: 'localSample';
  chapterTitle?: string;
  leadQuote?: string;
  playerParagraph: string;
  narrationParagraphs: string[];
  characterName: string;
  characterParagraphs: string[];
  miniTheater?: {
    mode: Exclude<MeetingMiniTheaterMode, 'off'>;
    title: string;
    content: string;
  };
  note: string;
}

export interface MeetingPresetTrialInput {
  config: MeetingConfig;
  mainPrompt?: string;
  isZh?: boolean;
  variant?: number;
}

const compact = (value: string, maxLength: number) => (
  Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, maxLength).join('')
);

const zhPersonLabels: Record<MeetingNarrationPerson, string> = {
  preset: '跟随手写预设',
  first: '第一人称旁白',
  second: '第二人称旁白',
  third: '第三人称旁白',
};

const enPersonLabels: Record<MeetingNarrationPerson, string> = {
  preset: 'Follow free-text prompt',
  first: 'First-person narration',
  second: 'Second-person narration',
  third: 'Third-person narration',
};

const describeAddress = (config: MeetingConfig, isZh: boolean) => {
  const userAddress = config.narrative.userAddress;
  const characterAddress = config.narrative.characterAddress;
  const userLabels = isZh
    ? {
        preset: 'user 跟随预设',
        firstPerson: 'user 用“我”',
        secondPerson: 'user 用“你”',
        name: 'user 使用姓名',
        custom: `user 称作“${userAddress.customLabel}”`,
      }
    : {
        preset: 'user follows prompt',
        firstPerson: 'user as I / me',
        secondPerson: 'user as you',
        name: 'user by name',
        custom: `user as “${userAddress.customLabel}”`,
      };
  const characterLabels = isZh
    ? {
        preset: '角色跟随预设',
        name: '角色使用姓名',
        pronoun: '角色使用代词',
        custom: `角色称作“${characterAddress.customLabel}”`,
      }
    : {
        preset: 'character follows prompt',
        name: 'character by name',
        pronoun: 'character by pronoun',
        custom: `character as “${characterAddress.customLabel}”`,
      };
  return `${userLabels[userAddress.mode]} · ${characterLabels[characterAddress.mode]}`;
};

export const buildMeetingPresetRuleSummary = (
  value: unknown,
  options: { mainPrompt?: string; isZh?: boolean } = {},
): MeetingPresetRuleSummaryItem[] => {
  const config = normalizeMeetingConfig(value);
  const narrative = config.narrative;
  const isZh = options.isZh !== false;
  const hasFreeTextPrompt = Boolean(options.mainPrompt?.trim());
  const style = narrative.stylePrompt.trim();
  const bannedCount = narrative.bannedTerms.filter(Boolean).length;
  const theaterLabels = isZh
    ? { off: '关闭', manual: '手动生成', everyTurn: '每回合生成' }
    : { off: 'Off', manual: 'Manual', everyTurn: 'Every turn' };
  const layoutLabels = isZh
    ? { profileNovel: '角色档案式', pureNovel: '纯小说', compact: '紧凑阅读' }
    : { profileNovel: 'Character profile', pureNovel: 'Pure novel', compact: 'Compact reading' };
  const densityLabels = isZh
    ? { compact: '紧凑段落', balanced: '适中段落', spacious: '舒展段落' }
    : { compact: 'Compact paragraphs', balanced: 'Balanced paragraphs', spacious: 'Spacious paragraphs' };
  const lengthLabel = narrative.length.min > 0
    ? `${narrative.length.min}–${narrative.length.max} · ${isZh ? '目标' : 'target'} ${narrative.length.target}`
    : `${isZh ? '最多' : 'Up to'} ${narrative.length.max} · ${isZh ? '目标' : 'target'} ${narrative.length.target}`;
  return [
    {
      id: 'style',
      label: isZh ? '文风' : 'Style',
      value: style
        ? `${compact(style, 60)}${hasFreeTextPrompt
          ? (isZh ? ' · 冲突时主提示词优先' : ' · main prompt wins conflicts')
          : ''}`
        : hasFreeTextPrompt
          ? (isZh ? '跟随主提示词（主提示词优先）' : 'Follow main prompt (main prompt wins)')
          : (isZh ? '未额外限定' : 'No extra direction'),
    },
    { id: 'length', label: isZh ? '篇幅' : 'Length', value: lengthLabel },
    {
      id: 'viewpoint',
      label: isZh ? '人称' : 'Viewpoint',
      value: `${(isZh ? zhPersonLabels : enPersonLabels)[narrative.narrationPerson]} · ${describeAddress(config, isZh)}`,
    },
    {
      id: 'layout',
      label: isZh ? '排版' : 'Layout',
      value: `${layoutLabels[narrative.layout]} · ${densityLabels[narrative.paragraphDensity]} · ${narrative.dialogueRatio}% ${isZh ? '对白' : 'dialogue'}`,
    },
    {
      id: 'leadQuote',
      label: isZh ? '章节装饰' : 'Chapter trim',
      value: [
        narrative.showChapterTitle ? (isZh ? '章节名' : 'chapter title') : '',
        narrative.showLeadQuote ? (isZh ? '相关短诗引文' : 'related poetic lead') : '',
      ].filter(Boolean).join(' · ') || (isZh ? '全部关闭' : 'All off'),
    },
    { id: 'theater', label: isZh ? '小剧场' : 'Mini-theater', value: theaterLabels[config.miniTheater.mode] },
    {
      id: 'status',
      label: isZh ? '状态栏' : 'Status bar',
      value: isZh
        ? `${config.statusFields.scene.length} 个场景字段 · ${config.statusFields.character.length} 个角色字段`
        : `${config.statusFields.scene.length} scene · ${config.statusFields.character.length} character fields`,
    },
    {
      id: 'restrictions',
      label: isZh ? '限制' : 'Limits',
      value: isZh
        ? `${bannedCount} 个禁用词 · ${narrative.enforcement === 'strict' ? '严格检查并重写' : '提示模型避开'}`
        : `${bannedCount} banned · ${narrative.enforcement === 'strict' ? 'strict rewrite' : 'model guidance'}`,
    },
  ];
};

const resolveUserReference = (config: MeetingConfig, isZh: boolean) => {
  switch (config.narrative.userAddress.mode) {
    case 'firstPerson': return isZh ? '我' : 'I';
    case 'secondPerson': return isZh ? '你' : 'you';
    case 'name': return 'Nana';
    case 'custom': return config.narrative.userAddress.customLabel || (isZh ? '你' : 'you');
    default: return isZh ? '你' : 'you';
  }
};

const resolveCharacterReference = (config: MeetingConfig, isZh: boolean) => {
  switch (config.narrative.characterAddress.mode) {
    case 'pronoun': return isZh ? '她' : 'she';
    case 'custom': return config.narrative.characterAddress.customLabel || (isZh ? '露娜' : 'Luna');
    default: return isZh ? '露娜' : 'Luna';
  }
};

const removeBannedTerms = (text: string, terms: readonly string[]) => terms.reduce(
  (result, term) => term ? result.replaceAll(term, '……') : result,
  text,
);

/**
 * Produces an ephemeral, deterministic sample. It never calls a repository,
 * creates a MeetingScene, or writes relationship memory.
 */
export const createLocalMeetingPresetTrial = ({
  config: rawConfig,
  isZh = true,
  variant = 0,
}: MeetingPresetTrialInput): MeetingPresetTrialResult => {
  const config = normalizeMeetingConfig(rawConfig);
  const user = resolveUserReference(config, isZh);
  const character = resolveCharacterReference(config, isZh);
  const alternate = Math.abs(Math.round(variant)) % 2 === 1;
  const zhNarration = alternate
    ? `${user}推开玻璃门时，檐上的水正好落下一线。室内没有催促人的声音，只有杯沿碰过木桌的轻响。${character}抬起眼，把靠窗的位置留了出来。`
    : `雨刚停，门外的灯在湿润路面上铺开一层薄薄的光。${user}收起伞，${character}已经把温水推到空着的座位前，像把一路没说完的话也一并留在那里。`;
  const enNarration = alternate
    ? `${user} opened the glass door as the last rain slipped from the eaves. Nothing inside hurried the moment. ${character} looked up and kept the seat by the window open.`
    : `The rain had just stopped, leaving a thin wash of light across the pavement. As ${user} folded the umbrella, ${character} nudged a glass of warm water toward the empty chair.`;
  const dialogue = isZh
    ? (alternate ? '“先坐一会儿吧。刚才隔着屏幕没说完的，可以慢慢说。”' : '“外面冷不冷？我没替你点单，想等你到了再选。”')
    : (alternate ? '“Sit for a while. We can finish what the screen left unsaid.”' : '“Was it cold outside? I waited so you could choose for yourself.”');
  const closing = isZh
    ? `那句话落下后，谁也没有急着把沉默填满。窗上的雨痕缓慢滑下，给这次真正面对面的见面留出一点呼吸。`
    : 'Neither of them hurried to fill the quiet. Rain traces moved down the glass, leaving this first face-to-face moment room to breathe.';
  const bannedTerms = config.narrative.bannedTerms;
  return {
    source: 'localSample',
    ...(config.narrative.showChapterTitle
      ? { chapterTitle: isZh ? (alternate ? '檐下余雨' : '雨停以后') : (alternate ? 'Rain at the Eaves' : 'After the Rain') }
      : {}),
    ...(config.narrative.showLeadQuote
      ? { leadQuote: isZh ? '雨声退到窗外，\n未说的话才有了温度。' : 'Rain recedes beyond the glass;\nunsaid words begin to warm.' }
      : {}),
    playerParagraph: isZh ? '我把伞靠在门边，走到她对面的空位坐下。' : 'I left the umbrella by the door and took the empty seat across from her.',
    narrationParagraphs: [
      removeBannedTerms(isZh ? zhNarration : enNarration, bannedTerms),
      removeBannedTerms(closing, bannedTerms),
    ],
    characterName: isZh ? '露娜' : 'Luna',
    characterParagraphs: [removeBannedTerms(dialogue, bannedTerms)],
    ...(config.miniTheater.mode === 'off' ? {} : {
      miniTheater: {
        mode: config.miniTheater.mode,
        title: isZh ? '窗边的一分钟' : 'A minute by the window',
        content: isZh ? '杯壁上的雾气散开以前，两道影子在桌面上短暂地靠近。' : 'Before the mist left the glass, two shadows briefly met across the table.',
      },
    }),
    note: isZh
      ? '本地短样例，只用于检查排版和规则；不会创建场景、消耗 API 或写入记忆。正式回合会按设定篇幅生成。'
      : 'Local short sample for layout and rule checks only. It creates no scene, uses no API, and writes no memory. Real turns follow the configured length.',
  };
};

export const generateLocalMeetingPresetTrial = async (
  input: MeetingPresetTrialInput,
): Promise<MeetingPresetTrialResult> => createLocalMeetingPresetTrial(input);
