import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { buildMeetingInlineDocument } from '../features/meeting/domain/meeting-parser';
import type {
  MeetingConfig,
  MeetingHtmlTemplateConfig,
  MeetingMiniTheaterConfig,
  MeetingStatusFieldConfig,
} from '../features/meeting/domain/meeting-types';
import { MeetingHtmlPanel } from '../features/meeting/ui/meeting-html-panel';
import { MeetingPresetTrialPanel } from '../features/meeting/ui/meeting-preset-trial-panel';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

type StatusScope = keyof MeetingConfig['statusFields'];
type NarrativeConfig = MeetingConfig['narrative'];

interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
}

function EditorInput({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
  multiline = false,
  compact = false,
  keyboardType,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  testID?: string;
  multiline?: boolean;
  compact?: boolean;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <NeumorphicSurface
      depth="inset"
      tone="lavender"
      radius={compact ? 12 : 15}
      style={{ flex: compact ? 1 : undefined, minHeight: multiline ? 104 : 46 }}
      contentStyle={{ paddingHorizontal: compact ? 10 : 13, paddingVertical: multiline ? 10 : 0 }}
    >
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={neumorphicPalette.onLightSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: multiline ? 82 : 44,
          color: neumorphicPalette.onLightPrimary,
          fontSize: compact ? 13 : 14,
          lineHeight: compact ? 18 : 21,
          paddingVertical: 0,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </NeumorphicSurface>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, lineHeight: 21, fontWeight: '800' }}>
        {title}
      </Text>
      {detail ? (
        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 18 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 18, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testIDPrefix,
}: {
  label?: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <AnimatedPressable
              key={String(option.value)}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{ minHeight: 44, minWidth: 92, flexGrow: 1, flexBasis: '44%', borderRadius: 13 }}
            >
              <NeumorphicSurface
                pointerEvents="none"
                depth={selected ? 'inset' : 'raisedSmall'}
                tone={selected ? 'pinkGold' : 'lavender'}
                radius={13}
                style={{ position: 'absolute', inset: 0 }}
                contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: neumorphicPalette.onLightPrimary,
                    fontSize: 12,
                    lineHeight: 16,
                    fontWeight: selected ? '800' : '700',
                    textAlign: 'center',
                  }}
                >
                  {option.label}
                </Text>
              </NeumorphicSurface>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
          {label}
        </Text>
        {detail ? (
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#968EA4', true: neumorphicPalette.relationship }}
        thumbColor={value ? '#FFF9FF' : '#E8E1EC'}
      />
    </View>
  );
}

function ExpandableSection({
  title,
  summary,
  open,
  onToggle,
  testID,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: neumorphicPalette.hairline }}>
      <AnimatedPressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 20, fontWeight: '800' }}>
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>
            {summary}
          </Text>
        </View>
        {open
          ? <ChevronDown size={19} color={neumorphicPalette.onLightPrimary} />
          : <ChevronRight size={19} color={neumorphicPalette.onLightPrimary} />}
      </AnimatedPressable>
      {open ? <View style={{ paddingBottom: 18, gap: 16 }}>{children}</View> : null}
    </View>
  );
}

function StatusFieldRows({
  title,
  fields,
  onChange,
  onAdd,
  onDelete,
  isZh,
}: {
  title: string;
  fields: MeetingStatusFieldConfig[];
  onChange: (index: number, patch: Partial<MeetingStatusFieldConfig>) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  isZh: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>{title}</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={isZh ? `添加${title}` : `Add ${title}`}
          onPress={onAdd}
          style={{ width: 44, height: 44, borderRadius: 22 }}
        >
          <NeumorphicSurface pointerEvents="none" depth="raisedSmall" tone="lavender" radius={22} style={{ position: 'absolute', inset: 0 }} contentStyle={{ alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={17} color={neumorphicPalette.onLightPrimary} />
          </NeumorphicSurface>
        </AnimatedPressable>
      </View>
      {fields.map((field, index) => (
        <View key={`${field.key}-${index}`} style={{ gap: 7, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <EditorInput
              compact
              value={field.key}
              onChangeText={key => onChange(index, { key })}
              placeholder="fieldKey"
              accessibilityLabel={isZh ? '字段标识' : 'Field key'}
            />
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={isZh ? `删除${field.label || field.key}` : `Delete ${field.label || field.key}`}
              onPress={() => onDelete(index)}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={17} color="#8E395C" />
            </AnimatedPressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <EditorInput compact value={field.label} onChangeText={label => onChange(index, { label })} placeholder={isZh ? '显示名称' : 'Label'} />
            <EditorInput compact value={field.initialValue} onChangeText={initialValue => onChange(index, { initialValue })} placeholder={isZh ? '开场值' : 'Opening value'} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MeetingPresetConfigEditor({
  value,
  onChange,
  mainPrompt,
}: {
  value: MeetingConfig;
  onChange: (value: MeetingConfig) => void;
  mainPrompt?: string;
}) {
  const isZh = useNanaStore(state => state.themeConfig.language === 'zh');
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple');
  const [openSections, setOpenSections] = useState({
    narrative: true,
    address: false,
    restrictions: false,
    status: false,
    theater: false,
  });
  const narrative = value.narrative;
  const copy = isZh ? {
    title: '见面叙事预设',
    detail: '手写提示词决定创作方向；严格模式会另外校验篇幅、结构和禁词。',
    narrative: '写作方式',
    narrativeSummary: '文风、篇幅、对白和阅读排版',
    style: '文风',
    styleHint: '可以写情绪、节奏、描写重点；留空就完全跟随主提示词。',
    stylePlaceholder: '例如：克制细腻，重动作和潜台词，避免总结式旁白',
    length: '每回合篇幅（字）',
    min: '最少',
    target: '期望',
    max: '最多',
    dialogue: '对白占比',
    dialogueHint: '这是写作倾向，不会机械地截断句子。',
    density: '段落密度',
    layout: '主线排版',
    chapterTitle: '显示章节标题',
    leadQuote: '显示开场大引文',
    address: '视角与称呼',
    addressSummary: '旁白、user 和角色如何被称呼',
    narrationPerson: '旁白人称',
    userAddress: '怎么称呼 user',
    characterAddress: '怎么称呼角色',
    customAddress: '自定义称呼',
    restrictions: '写作限制',
    restrictionsSummary: `${narrative.bannedTerms.filter(term => term.trim()).length} 个禁用词 · ${narrative.enforcement === 'strict' ? '严格检查' : '提示模型'}`,
    bannedTerms: '禁用词 / 八股词',
    bannedHint: '每行一个。严格模式下，命中后会要求模型重写本回合。',
    bannedPlaceholder: '不禁让人\n嘴角勾起\n眸色一沉',
    enforcement: '命中时',
    status: '自定义状态栏',
    statusSummary: `${value.statusFields.scene.length} 个场景字段 · ${value.statusFields.character.length} 个角色字段`,
    contextPrivacy: '只有字段名称和值进入主线上下文；HTML 和 CSS 只负责显示。',
    sceneFields: '场景字段',
    characterFields: '角色字段',
    statusHtml: '状态栏 HTML',
    statusCss: '状态栏 CSS',
    preview: '示例预览',
    theater: '小剧场',
    theaterSummary: value.miniTheater.mode === 'off' ? '已关闭' : value.miniTheater.mode === 'manual' ? '手动生成' : '每回合生成',
    theaterPrivacy: '小剧场属于章节尾注，不进入后续主线、摘要或长期记忆。',
    theaterPrompt: '小剧场写什么',
    theaterHtml: '小剧场 HTML',
    theaterCss: '小剧场 CSS',
    height: '固定高度',
    modes: { off: '关闭', manual: '手动生成', everyTurn: '每回合生成' },
  } : {
    title: 'Meeting narrative preset',
    detail: 'Free-text prompts lead the creative direction. Strict mode also validates length, structure, and banned terms.',
    narrative: 'Writing style',
    narrativeSummary: 'Voice, length, dialogue, and reading layout',
    style: 'Prose direction',
    styleHint: 'Describe mood, pacing, and emphasis. Leave blank to follow the main prompt only.',
    stylePlaceholder: 'For example: restrained and intimate, led by gestures and subtext',
    length: 'Per-turn length (characters)',
    min: 'Minimum',
    target: 'Target',
    max: 'Maximum',
    dialogue: 'Dialogue balance',
    dialogueHint: 'A writing preference, not a mechanical sentence cutoff.',
    density: 'Paragraph density',
    layout: 'Story layout',
    chapterTitle: 'Show chapter titles',
    leadQuote: 'Show opening lead quote',
    address: 'Viewpoint and address',
    addressSummary: 'Narrator, user, and character references',
    narrationPerson: 'Narrator person',
    userAddress: 'How to refer to the user',
    characterAddress: 'How to refer to characters',
    customAddress: 'Custom label',
    restrictions: 'Writing limits',
    restrictionsSummary: `${narrative.bannedTerms.filter(term => term.trim()).length} banned terms · ${narrative.enforcement === 'strict' ? 'strict rewrite' : 'model guidance'}`,
    bannedTerms: 'Banned or stale phrases',
    bannedHint: 'One per line. Strict mode asks for a rewrite when a term appears.',
    bannedPlaceholder: 'a knowing smile\neyes darkened\ncould not help but',
    enforcement: 'When matched',
    status: 'Custom status bar',
    statusSummary: `${value.statusFields.scene.length} scene fields · ${value.statusFields.character.length} character fields`,
    contextPrivacy: 'Only field names and values enter the story context. HTML and CSS only affect presentation.',
    sceneFields: 'Scene fields',
    characterFields: 'Character fields',
    statusHtml: 'Status HTML',
    statusCss: 'Status CSS',
    preview: 'Sample preview',
    theater: 'Mini-theater',
    theaterSummary: value.miniTheater.mode === 'off' ? 'Off' : value.miniTheater.mode === 'manual' ? 'Manual' : 'Every turn',
    theaterPrivacy: 'Mini-theaters are chapter endnotes. They never enter later story context, recaps, or long-term memory.',
    theaterPrompt: 'What should it contain?',
    theaterHtml: 'Mini-theater HTML',
    theaterCss: 'Mini-theater CSS',
    height: 'Fixed height',
    modes: { off: 'Off', manual: 'Manual', everyTurn: 'Every turn' },
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(current => ({ ...current, [key]: !current[key] }));
  };
  const updateNarrative = (patch: Partial<NarrativeConfig>) => onChange({
    ...value,
    narrative: { ...narrative, ...patch },
  });
  const updateFields = (scope: StatusScope, fields: MeetingStatusFieldConfig[]) => onChange({
    ...value,
    statusFields: { ...value.statusFields, [scope]: fields },
  });
  const updateTemplate = (patch: Partial<MeetingHtmlTemplateConfig>) => onChange({
    ...value,
    statusTemplate: { ...value.statusTemplate, ...patch },
  });
  const updateTheater = (patch: Partial<MeetingMiniTheaterConfig>) => onChange({
    ...value,
    miniTheater: { ...value.miniTheater, ...patch },
  });
  const statusPreview = useMemo(() => buildMeetingInlineDocument({
    html: value.statusTemplate.html,
    css: value.statusTemplate.css,
    placeholders: {
      meta: { sceneTitle: isZh ? '雨夜咖啡馆' : 'Rainy cafe', userName: isZh ? '你' : 'You' },
      scene: Object.fromEntries(value.statusFields.scene.map(field => [field.key, field.initialValue || '—'])),
      user: { name: isZh ? '你' : 'You' },
      cast: [{
        id: 'character1',
        name: isZh ? '露娜' : 'Luna',
        values: Object.fromEntries(value.statusFields.character.map(field => [field.key, field.initialValue || '—'])),
      }],
      characters: {
        character1: Object.fromEntries(value.statusFields.character.map(field => [field.key, field.initialValue || '—'])),
      },
      currentCharacterId: 'character1',
    },
  }), [isZh, value.statusFields, value.statusTemplate.css, value.statusTemplate.html]);
  const theaterPreview = useMemo(() => buildMeetingInlineDocument({
    html: value.miniTheater.html,
    css: value.miniTheater.css,
    placeholders: {
      meta: {
        title: isZh ? '窗外的一分钟' : 'A minute by the window',
        content: isZh ? '雨声把没有说完的话藏进了灯影里。' : 'The rain hid the unfinished words in the light.',
      },
    },
  }), [isZh, value.miniTheater.css, value.miniTheater.html]);

  const simpleLength = (
    narrative.length.min === 200 && narrative.length.target === 400 && narrative.length.max === 700
      ? 'short'
      : narrative.length.min === 500 && narrative.length.target === 900 && narrative.length.max === 1_400
        ? 'medium'
        : narrative.length.min === 900 && narrative.length.target === 1_600 && narrative.length.max === 2_800
          ? 'long'
          : 'custom'
  ) as 'short' | 'medium' | 'long' | 'custom';
  const updateSimpleLength = (length: 'short' | 'medium' | 'long' | 'custom') => {
    if (length === 'custom') return;
    const values = {
      short: { min: 200, target: 400, max: 700 },
      medium: { min: 500, target: 900, max: 1_400 },
      long: { min: 900, target: 1_600, max: 2_800 },
    } as const;
    updateNarrative({ length: values[length] });
  };

  const personOptions: readonly ChoiceOption<NarrativeConfig['narrationPerson']>[] = isZh
    ? [
        { value: 'preset', label: '跟随手写预设' },
        { value: 'first', label: '第一人称' },
        { value: 'second', label: '第二人称' },
        { value: 'third', label: '第三人称' },
      ]
    : [
        { value: 'preset', label: 'Follow prompt' },
        { value: 'first', label: 'First person' },
        { value: 'second', label: 'Second person' },
        { value: 'third', label: 'Third person' },
      ];
  const userAddressOptions: readonly ChoiceOption<NarrativeConfig['userAddress']['mode']>[] = isZh
    ? [
        { value: 'preset', label: '跟随手写预设' },
        { value: 'firstPerson', label: '用“我”' },
        { value: 'secondPerson', label: '用“你”' },
        { value: 'name', label: '使用用户姓名' },
        { value: 'custom', label: '自定义称呼' },
      ]
    : [
        { value: 'preset', label: 'Follow prompt' },
        { value: 'firstPerson', label: 'I / me' },
        { value: 'secondPerson', label: 'You' },
        { value: 'name', label: 'User name' },
        { value: 'custom', label: 'Custom' },
      ];
  const characterAddressOptions: readonly ChoiceOption<NarrativeConfig['characterAddress']['mode']>[] = isZh
    ? [
        { value: 'preset', label: '跟随手写预设' },
        { value: 'name', label: '使用角色名' },
        { value: 'pronoun', label: '使用他 / 她 / TA' },
        { value: 'custom', label: '自定义称呼' },
      ]
    : [
        { value: 'preset', label: 'Follow prompt' },
        { value: 'name', label: 'Character name' },
        { value: 'pronoun', label: 'Pronouns' },
        { value: 'custom', label: 'Custom' },
      ];

  return (
    <NeumorphicSurface testID="meeting-preset-editor" depth="raisedSmall" tone="lavender" radius={20} style={{ marginBottom: 18 }} contentStyle={{ paddingHorizontal: 15, paddingTop: 16 }}>
      <View style={{ paddingBottom: 16 }}>
        <SectionTitle title={copy.title} detail={copy.detail} />
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, paddingBottom: 14 }}>
        {(['simple', 'advanced'] as const).map(mode => {
          const selected = editorMode === mode;
          const label = mode === 'simple'
            ? (isZh ? '简单设置' : 'Simple')
            : (isZh ? '高级设置' : 'Advanced');
          return (
            <AnimatedPressable
              key={mode}
              testID={`meeting-preset-mode-${mode}`}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setEditorMode(mode)}
              style={{ flex: 1, minHeight: 46, borderRadius: 14 }}
            >
              <NeumorphicSurface
                pointerEvents="none"
                depth={selected ? 'inset' : 'raisedSmall'}
                tone={selected ? 'pinkGold' : 'lavender'}
                radius={14}
                style={{ position: 'absolute', inset: 0 }}
                contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
              >
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
                  {label}
                </Text>
              </NeumorphicSurface>
            </AnimatedPressable>
          );
        })}
      </View>

      {editorMode === 'simple' ? (
        <View testID="meeting-preset-simple-editor" style={{ gap: 18, paddingBottom: 18 }}>
          <View style={{ gap: 8 }}>
            <FieldLabel>{copy.style}</FieldLabel>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>{copy.styleHint}</Text>
            <EditorInput
              value={narrative.stylePrompt}
              onChangeText={stylePrompt => updateNarrative({ stylePrompt })}
              placeholder={copy.stylePlaceholder}
              accessibilityLabel={copy.style}
              testID="meeting-preset-simple-style"
              multiline
            />
          </View>
          <ChoiceGroup
            testIDPrefix="meeting-preset-simple-length"
            label={copy.length}
            value={simpleLength}
            onChange={updateSimpleLength}
            options={(isZh
              ? [
                  { value: 'short', label: '短篇 · 约 400 字' },
                  { value: 'medium', label: '中篇 · 约 900 字' },
                  { value: 'long', label: '长篇 · 约 1600 字' },
                  { value: 'custom', label: `自定义 · 约 ${narrative.length.target} 字` },
                ]
              : [
                  { value: 'short', label: 'Short · about 400' },
                  { value: 'medium', label: 'Medium · about 900' },
                  { value: 'long', label: 'Long · about 1600' },
                  { value: 'custom', label: `Custom · about ${narrative.length.target}` },
                ]) as readonly ChoiceOption<'short' | 'medium' | 'long' | 'custom'>[]}
          />
          <ChoiceGroup
            testIDPrefix="meeting-preset-simple-person"
            label={copy.narrationPerson}
            value={narrative.narrationPerson}
            onChange={narrationPerson => updateNarrative({ narrationPerson })}
            options={personOptions}
          />
          <View style={{ gap: 8 }}>
            <FieldLabel>{copy.theater}</FieldLabel>
            <ChoiceGroup
              testIDPrefix="meeting-preset-simple-theater"
              value={value.miniTheater.mode}
              onChange={mode => updateTheater({ mode })}
              options={(['off', 'manual', 'everyTurn'] as const).map(mode => ({ value: mode, label: copy.modes[mode] }))}
            />
          </View>
          <View style={{ gap: 2 }}>
            <ToggleRow testID="meeting-preset-simple-chapter-title" label={copy.chapterTitle} value={narrative.showChapterTitle} onValueChange={showChapterTitle => updateNarrative({ showChapterTitle })} />
            <ToggleRow testID="meeting-preset-simple-lead-quote" label={copy.leadQuote} value={narrative.showLeadQuote} onValueChange={showLeadQuote => updateNarrative({ showLeadQuote })} />
          </View>
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 17 }}>
            {isZh
              ? '称呼、对白比例、禁用词、状态栏 HTML/CSS 和小剧场模板会保留原值；需要调整时切到高级设置。'
              : 'Addressing, dialogue balance, banned terms, status HTML/CSS, and theater templates keep their values. Open Advanced to edit them.'}
          </Text>
        </View>
      ) : (
        <>

      <ExpandableSection testID="meeting-preset-section-narrative" title={copy.narrative} summary={copy.narrativeSummary} open={openSections.narrative} onToggle={() => toggleSection('narrative')}>
        <View style={{ gap: 8 }}>
          <FieldLabel>{copy.style}</FieldLabel>
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>{copy.styleHint}</Text>
          <EditorInput
            value={narrative.stylePrompt}
            onChangeText={stylePrompt => updateNarrative({ stylePrompt })}
            placeholder={copy.stylePlaceholder}
            accessibilityLabel={copy.style}
            testID="meeting-preset-style"
            multiline
          />
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{copy.length}</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              ['min', copy.min],
              ['target', copy.target],
              ['max', copy.max],
            ] as const).map(([key, label]) => (
              <View key={key} style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, textAlign: 'center' }}>{label}</Text>
                <EditorInput
                  compact
                  value={String(narrative.length[key])}
                  onChangeText={text => updateNarrative({
                    length: { ...narrative.length, [key]: Number(text.replace(/\D/gu, '')) || 0 },
                  })}
                  placeholder="0"
                  accessibilityLabel={`${copy.length} ${label}`}
                  testID={`meeting-preset-length-${key}`}
                  keyboardType="number-pad"
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{copy.dialogue}</FieldLabel>
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>{copy.dialogueHint}</Text>
          <ChoiceGroup
            testIDPrefix="meeting-preset-dialogue"
            value={narrative.dialogueRatio}
            onChange={dialogueRatio => updateNarrative({ dialogueRatio })}
            options={(isZh
              ? [
                  { value: 20, label: '偏少 · 20%' },
                  { value: 35, label: '适中 · 35%' },
                  { value: 50, label: '均衡 · 50%' },
                  { value: 70, label: '偏多 · 70%' },
                ]
              : [
                  { value: 20, label: 'Light · 20%' },
                  { value: 35, label: 'Moderate · 35%' },
                  { value: 50, label: 'Balanced · 50%' },
                  { value: 70, label: 'Dialogue-led · 70%' },
                ]) as readonly ChoiceOption<number>[]}
          />
          {![20, 35, 50, 70].includes(narrative.dialogueRatio) ? (
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, textAlign: 'center' }}>
              {isZh ? `当前自定义值：${narrative.dialogueRatio}%` : `Current custom value: ${narrative.dialogueRatio}%`}
            </Text>
          ) : null}
        </View>

        <ChoiceGroup
          testIDPrefix="meeting-preset-density"
          label={copy.density}
          value={narrative.paragraphDensity}
          onChange={paragraphDensity => updateNarrative({ paragraphDensity })}
          options={isZh
            ? [
                { value: 'compact', label: '紧凑' },
                { value: 'balanced', label: '适中' },
                { value: 'spacious', label: '舒展' },
              ]
            : [
                { value: 'compact', label: 'Compact' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'spacious', label: 'Spacious' },
              ]}
        />
        <ChoiceGroup
          testIDPrefix="meeting-preset-layout"
          label={copy.layout}
          value={narrative.layout}
          onChange={layout => updateNarrative({ layout })}
          options={isZh
            ? [
                { value: 'profileNovel', label: '角色档案式' },
                { value: 'pureNovel', label: '纯小说' },
                { value: 'compact', label: '紧凑阅读' },
              ]
            : [
                { value: 'profileNovel', label: 'Character profile' },
                { value: 'pureNovel', label: 'Pure novel' },
                { value: 'compact', label: 'Compact reading' },
              ]}
        />
        <View style={{ gap: 2 }}>
          <ToggleRow testID="meeting-preset-show-chapter-title" label={copy.chapterTitle} value={narrative.showChapterTitle} onValueChange={showChapterTitle => updateNarrative({ showChapterTitle })} />
          <ToggleRow testID="meeting-preset-show-lead-quote" label={copy.leadQuote} value={narrative.showLeadQuote} onValueChange={showLeadQuote => updateNarrative({ showLeadQuote })} />
        </View>
      </ExpandableSection>

      <ExpandableSection testID="meeting-preset-section-address" title={copy.address} summary={copy.addressSummary} open={openSections.address} onToggle={() => toggleSection('address')}>
        <ChoiceGroup testIDPrefix="meeting-preset-narration-person" label={copy.narrationPerson} value={narrative.narrationPerson} onChange={narrationPerson => updateNarrative({ narrationPerson })} options={personOptions} />
        <ChoiceGroup
          testIDPrefix="meeting-preset-user-address"
          label={copy.userAddress}
          value={narrative.userAddress.mode}
          onChange={mode => updateNarrative({ userAddress: { ...narrative.userAddress, mode } })}
          options={userAddressOptions}
        />
        {narrative.userAddress.mode === 'custom' ? (
          <EditorInput
            value={narrative.userAddress.customLabel}
            onChangeText={customLabel => updateNarrative({ userAddress: { ...narrative.userAddress, customLabel } })}
            placeholder={copy.customAddress}
            accessibilityLabel={`${copy.userAddress} ${copy.customAddress}`}
            testID="meeting-preset-user-custom-label"
          />
        ) : null}
        <ChoiceGroup
          testIDPrefix="meeting-preset-character-address"
          label={copy.characterAddress}
          value={narrative.characterAddress.mode}
          onChange={mode => updateNarrative({ characterAddress: { ...narrative.characterAddress, mode } })}
          options={characterAddressOptions}
        />
        {narrative.characterAddress.mode === 'custom' ? (
          <EditorInput
            value={narrative.characterAddress.customLabel}
            onChangeText={customLabel => updateNarrative({ characterAddress: { ...narrative.characterAddress, customLabel } })}
            placeholder={copy.customAddress}
            accessibilityLabel={`${copy.characterAddress} ${copy.customAddress}`}
            testID="meeting-preset-character-custom-label"
          />
        ) : null}
      </ExpandableSection>

      <ExpandableSection testID="meeting-preset-section-restrictions" title={copy.restrictions} summary={copy.restrictionsSummary} open={openSections.restrictions} onToggle={() => toggleSection('restrictions')}>
        <View style={{ gap: 7 }}>
          <FieldLabel>{copy.bannedTerms}</FieldLabel>
          <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>{copy.bannedHint}</Text>
          <EditorInput
            value={narrative.bannedTerms.join('\n')}
            onChangeText={text => updateNarrative({ bannedTerms: text.split(/\r?\n/u) })}
            placeholder={copy.bannedPlaceholder}
            accessibilityLabel={copy.bannedTerms}
            testID="meeting-preset-banned-terms"
            multiline
          />
        </View>
        <ChoiceGroup
          testIDPrefix="meeting-preset-enforcement"
          label={copy.enforcement}
          value={narrative.enforcement}
          onChange={enforcement => updateNarrative({ enforcement })}
          options={isZh
            ? [
                { value: 'guide', label: '提示模型避开' },
                { value: 'strict', label: '严格检查并重写' },
              ]
            : [
                { value: 'guide', label: 'Guide the model' },
                { value: 'strict', label: 'Strict check and rewrite' },
              ]}
        />
      </ExpandableSection>

      <ExpandableSection testID="meeting-preset-section-status" title={copy.status} summary={copy.statusSummary} open={openSections.status} onToggle={() => toggleSection('status')}>
        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 17 }}>{copy.contextPrivacy}</Text>
        {(['scene', 'character'] as const).map(scope => (
          <StatusFieldRows
            key={scope}
            title={scope === 'scene' ? copy.sceneFields : copy.characterFields}
            fields={value.statusFields[scope]}
            onChange={(index, patch) => updateFields(scope, value.statusFields[scope].map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))}
            onAdd={() => updateFields(scope, [...value.statusFields[scope], { key: `field${value.statusFields[scope].length + 1}`, label: '', initialValue: '' }])}
            onDelete={index => updateFields(scope, value.statusFields[scope].filter((_, fieldIndex) => fieldIndex !== index))}
            isZh={isZh}
          />
        ))}
        <SectionTitle title={copy.statusHtml} detail={'{{scene.fieldKey}} · {{character1.name}} · {{character1.fieldKey}} · {{user.name}}'} />
        <EditorInput value={value.statusTemplate.html} onChangeText={html => updateTemplate({ html })} placeholder="<section>…</section>" accessibilityLabel={copy.statusHtml} multiline />
        <SectionTitle title={copy.statusCss} />
        <EditorInput value={value.statusTemplate.css} onChangeText={css => updateTemplate({ css })} placeholder=".status { … }" accessibilityLabel={copy.statusCss} multiline />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FieldLabel>{copy.height}</FieldLabel>
          <View style={{ width: 96 }}>
            <EditorInput compact value={String(value.statusTemplate.height)} onChangeText={height => updateTemplate({ height: Number(height.replace(/\D/gu, '')) || 0 })} placeholder="156" accessibilityLabel={copy.height} keyboardType="number-pad" />
          </View>
        </View>
        <SectionTitle title={copy.preview} />
        <MeetingHtmlPanel srcDoc={statusPreview} height={Math.max(72, Math.min(240, value.statusTemplate.height))} accessibilityLabel={copy.preview} />
      </ExpandableSection>

      <ExpandableSection testID="meeting-preset-section-theater" title={copy.theater} summary={copy.theaterSummary} open={openSections.theater} onToggle={() => toggleSection('theater')}>
        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 17 }}>{copy.theaterPrivacy}</Text>
        <ChoiceGroup
          testIDPrefix="meeting-preset-theater-mode"
          value={value.miniTheater.mode}
          onChange={mode => updateTheater({ mode })}
          options={(['off', 'manual', 'everyTurn'] as const).map(mode => ({ value: mode, label: copy.modes[mode] }))}
        />
        {value.miniTheater.mode !== 'off' ? (
          <>
            <SectionTitle title={copy.theaterPrompt} detail={'{{title}} · {{content}}'} />
            <EditorInput value={value.miniTheater.prompt} onChangeText={prompt => updateTheater({ prompt })} placeholder={copy.theaterPrompt} accessibilityLabel={copy.theaterPrompt} multiline />
            <SectionTitle title={copy.theaterHtml} />
            <EditorInput value={value.miniTheater.html} onChangeText={html => updateTheater({ html })} placeholder="<article>…</article>" accessibilityLabel={copy.theaterHtml} multiline />
            <SectionTitle title={copy.theaterCss} />
            <EditorInput value={value.miniTheater.css} onChangeText={css => updateTheater({ css })} placeholder=".mini-theater { … }" accessibilityLabel={copy.theaterCss} multiline />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <FieldLabel>{copy.height}</FieldLabel>
              <View style={{ width: 96 }}>
                <EditorInput compact value={String(value.miniTheater.height)} onChangeText={height => updateTheater({ height: Number(height.replace(/\D/gu, '')) || 0 })} placeholder="184" accessibilityLabel={copy.height} keyboardType="number-pad" />
              </View>
            </View>
            <SectionTitle title={copy.preview} />
            <MeetingHtmlPanel srcDoc={theaterPreview} height={Math.max(72, Math.min(240, value.miniTheater.height))} accessibilityLabel={copy.theater} />
          </>
        ) : null}
      </ExpandableSection>
        </>
      )}

      <MeetingPresetTrialPanel config={value} mainPrompt={mainPrompt} isZh={isZh} />
    </NeumorphicSurface>
  );
}
