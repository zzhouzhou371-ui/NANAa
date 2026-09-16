import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type TextProps,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BookHeart,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleStop,
  Clapperboard,
  MapPin,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { AnimatedPressable } from '@/components/primitives';
import { normalizeMeetingConfig } from '../domain/meeting-config';
import { buildMeetingInlineDocument } from '../domain/meeting-parser';
import type { MeetingConfig, MeetingScene, MeetingStatusSnapshot, MeetingTurn } from '../domain/meeting-types';
import { MeetingHtmlPanel } from './meeting-html-panel';
import { MeetingAvatar } from './meeting-ui-kit';
import type { MeetingCharacterOption, MeetingModelAdapter } from './meeting-ui-types';
import type { MeetingCopy } from '../meeting-copy';
import { useMeetingCopy } from './use-meeting-copy';

const PAPER = '#F1E9F0';
const PAPER_TINT = '#E9DDE6';
const PAPER_SOFT = '#F7F0F5';
const INK = '#25172E';
const MUTED = '#7A687B';
const SOFT = '#8B798C';
const ACCENT = '#A7788B';
const ACCENT_DARK = '#8D6074';
const RULE = '#DED2DC';
const DANGER = '#984059';
const SKY_IMAGE = require('../../../../assets/backgrounds/time-cycle-v1/dusk.png');
const SERIF_REGULAR = 'NotoSerifSC_400Regular';
const SERIF_MEDIUM = 'NotoSerifSC_500Medium';
const SERIF_SEMIBOLD = 'NotoSerifSC_600SemiBold';
const SERIF_BOLD = 'NotoSerifSC_700Bold';

function Text({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style);
  const numericWeight = typeof flattened?.fontWeight === 'string'
    ? Number.parseInt(flattened.fontWeight, 10)
    : flattened?.fontWeight;
  const fontFamily = typeof numericWeight === 'number' && numericWeight >= 700
    ? SERIF_BOLD
    : typeof numericWeight === 'number' && numericWeight >= 600
      ? SERIF_SEMIBOLD
      : typeof numericWeight === 'number' && numericWeight >= 500
        ? SERIF_MEDIUM
        : SERIF_REGULAR;

  return <NativeText {...props} style={[{ fontFamily }, style, { fontWeight: 'normal' }]} />;
}

interface MeetingSceneScreenProps {
  scene: MeetingScene;
  characters: MeetingCharacterOption[];
  userName?: string;
  compact: boolean;
  busy?: boolean;
  error?: string | null;
  modelAdapter?: MeetingModelAdapter;
  onBack: () => void;
  onReview: () => void;
  onDeleteScene?: () => void;
}

interface StatusFact {
  id: string;
  label: string;
  value: string;
}

type MeetingNarrative = MeetingConfig['narrative'];

function proseMetrics(narrative: MeetingNarrative, compact: boolean) {
  if (compact || narrative.layout === 'compact' || narrative.paragraphDensity === 'compact') {
    return { fontSize: 15, lineHeight: compact ? 24 : 25, gap: 14, turnPadding: 18 };
  }
  if (narrative.paragraphDensity === 'spacious') {
    return { fontSize: 16, lineHeight: 30, gap: 24, turnPadding: 30 };
  }
  return { fontSize: 16, lineHeight: 27, gap: 20, turnPadding: 24 };
}

function characterMapForPlaceholders(status: MeetingStatusSnapshot) {
  return Object.fromEntries(
    Object.entries(status.characters).map(([characterId, snapshot]) => [characterId, snapshot.values]),
  );
}

function orderedCastForPlaceholders(
  scene: MeetingScene,
  characters: MeetingCharacterOption[],
  status: MeetingStatusSnapshot,
) {
  return scene.castIds.map(characterId => ({
    id: characterId,
    name: characters.find(character => character.id === characterId)?.name ?? characterId,
    values: status.characters[characterId]?.values ?? {},
  }));
}

const STATUS_COPY = {
  '地点': 'Location',
  '气氛': 'Atmosphere',
  '情绪': 'Emotion',
  '位置': 'Position',
  '未定': 'Undetermined',
  '平静': 'Calm',
  '场景中': 'In the scene',
  '此刻': 'Now',
  '专注': 'Attentive',
  '在意': 'Engaged',
} as const;

const STATUS_COPY_REVERSE = {
  ...Object.fromEntries(
    Object.entries(STATUS_COPY).map(([zh, en]) => [en.toLocaleLowerCase(), zh]),
  ),
  'the present moment': '此刻',
} as Record<string, string>;

const STATUS_COPY_EN_ALIASES: Record<string, string> = {
  'the present moment': 'Now',
};

function localizeStatusText(value: string, copy: MeetingCopy) {
  if (copy.locale === 'zh-CN') return STATUS_COPY_REVERSE[value.trim().toLocaleLowerCase()] || value;
  return STATUS_COPY[value.trim() as keyof typeof STATUS_COPY]
    || STATUS_COPY_EN_ALIASES[value.trim().toLocaleLowerCase()]
    || value;
}

function localizeStatusTemplate(html: string, copy: MeetingCopy) {
  if (copy.locale === 'zh-CN') return html;
  return html
    .replace('见面状态', 'Meeting status')
    .replace('地点', 'Location')
    .replace('气氛', 'Atmosphere');
}

function collectStatusFacts(scene: MeetingScene, characters: MeetingCharacterOption[], copy: MeetingCopy) {
  const config = scene.presetSnapshot.meetingConfig;
  const sceneFacts: StatusFact[] = config.statusFields.scene.map(field => ({
    id: `scene:${field.key}`,
    label: localizeStatusText(field.label, copy),
    value: localizeStatusText(scene.status.scene[field.key] || field.initialValue, copy),
  }));
  const characterFacts: StatusFact[] = scene.castIds.flatMap(characterId => {
    const characterName = characters.find(character => character.id === characterId)?.name || characterId;
    return config.statusFields.character.map(field => ({
      id: `${characterId}:${field.key}`,
      label: `${characterName} · ${localizeStatusText(field.label, copy)}`,
      value: localizeStatusText(scene.status.characters[characterId]?.values[field.key] || field.initialValue, copy),
    }));
  });
  return { sceneFacts, characterFacts, all: [...sceneFacts, ...characterFacts] };
}

function factValue(facts: StatusFact[], patterns: RegExp[], fallback: string) {
  return facts.find(fact => patterns.some(pattern => pattern.test(`${fact.id} ${fact.label}`)))?.value || fallback;
}

function sceneClock(timestamp: number, locale: string) {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function ReadingIconButton({
  label,
  icon,
  onPress,
  disabled,
  selected,
  testID,
}: {
  label: string;
  icon: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}) {
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, expanded: selected }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      scale={0.96}
      style={{ width: 44, height: 44, borderRadius: 12, opacity: disabled ? 0.42 : 1 }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
    </AnimatedPressable>
  );
}

function MeetingNavigation({
  copy,
  compact,
  menuOpen,
  onBack,
  onToggleMenu,
}: {
  copy: MeetingCopy;
  compact: boolean;
  menuOpen: boolean;
  onBack: () => void;
  onToggleMenu: () => void;
}) {
  return (
    <View style={{ minHeight: compact ? 50 : 54, paddingHorizontal: compact ? 8 : 12, flexDirection: 'row', alignItems: 'center' }}>
      <ReadingIconButton label={copy.backToMeetingList} onPress={onBack} icon={<ChevronLeft size={25} color="#E6A0B8" strokeWidth={2.1} />} />
      <Text style={{ flex: 1, color: '#FFF9FF', fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'center' }}>
        {copy.meeting}
      </Text>
      <ReadingIconButton
        testID="meeting-scene-menu-button"
        label={menuOpen ? copy.closeMeetingMenu : copy.openMeetingMenu}
        selected={menuOpen}
        onPress={onToggleMenu}
        icon={<MoreHorizontal size={24} color="#E6A0B8" strokeWidth={2.3} />}
      />
    </View>
  );
}

function SceneMenu({
  copy,
  readOnly,
  busy,
  canEnd,
  canDelete,
  onReview,
  onEnd,
  onDelete,
}: {
  copy: MeetingCopy;
  readOnly: boolean;
  busy?: boolean;
  canEnd: boolean;
  canDelete: boolean;
  onReview: () => void;
  onEnd: () => void;
  onDelete?: () => void;
}) {
  const item = (label: string, icon: ReactNode, onPress?: () => void, danger = false, disabled = false) => (
    <AnimatedPressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={{ minHeight: 46, opacity: disabled ? 0.42 : 1 }}
    >
      <View style={{ minHeight: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        {icon}
        <Text style={{ color: danger ? DANGER : INK, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
  return (
    <View
      style={{
        position: 'absolute',
        top: 48,
        right: 12,
        zIndex: 50,
        width: 176,
        paddingVertical: 4,
        borderRadius: 12,
        borderCurve: 'continuous',
        backgroundColor: PAPER,
        boxShadow: '0 4px 8px rgba(27, 16, 35, 0.24)',
      }}
    >
      {readOnly
        ? item(copy.reviewSharedMemory, <BookHeart size={17} color={ACCENT_DARK} />, onReview)
        : item(copy.endMeeting, <CircleStop size={17} color={DANGER} />, onEnd, true, busy || !canEnd)}
      {canDelete ? item(copy.deleteMeeting, <Trash2 size={17} color={DANGER} />, onDelete, true, busy) : null}
    </View>
  );
}

function ProfileAvatarGroup({ cast, compact }: { cast: MeetingCharacterOption[]; compact: boolean }) {
  const size = compact ? 38 : 46;
  const overlap = compact ? 9 : 11;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: Math.max(0, cast.length - 1) * 4 }}>
      {cast.map((character, index) => (
        <View key={character.id} style={{ marginLeft: index === 0 ? 0 : -overlap, zIndex: cast.length - index }}>
          <MeetingAvatar character={character} size={size} variant="profile" />
        </View>
      ))}
    </View>
  );
}

function VinylDisc({ size }: { size: number }) {
  const rings = [0.9, 0.78, 0.66, 0.54];
  return (
    <LinearGradient
      colors={['#33283E', '#17121F', '#40324B']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px rgba(18, 9, 25, 0.35)' }}
    >
      {rings.map(ratio => (
        <View
          key={ratio}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size * ratio,
            height: size * ratio,
            borderRadius: size,
            borderWidth: 1,
            borderColor: 'rgba(238, 218, 231, 0.13)',
          }}
        />
      ))}
      <View style={{ width: size * 0.38, height: size * 0.38, borderRadius: size, backgroundColor: '#EBD9E2', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.05, height: size * 0.05, borderRadius: size, backgroundColor: '#57475F' }} />
      </View>
    </LinearGradient>
  );
}

function AtmospherePanel({
  copy,
  scene,
  location,
  atmosphere,
  compact,
}: {
  copy: MeetingCopy;
  scene: MeetingScene;
  location: string;
  atmosphere: string;
  compact: boolean;
}) {
  const height = compact ? 118 : 142;
  const discSize = compact ? 88 : 116;
  return (
    <View testID="meeting-atmosphere-panel" style={{ height, overflow: 'hidden', backgroundColor: '#67566F' }}>
      <Image source={SKY_IMAGE} contentFit="cover" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(55, 39, 64, 0.34)' }]} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: compact ? 14 : 18, gap: compact ? 18 : 26 }}>
        <VinylDisc size={discSize} />
        <View style={{ flex: 1, minWidth: 0, paddingLeft: compact ? 0 : 8, borderLeftWidth: compact ? 0 : 1, borderLeftColor: 'rgba(255, 243, 250, 0.18)', gap: compact ? 7 : 9 }}>
          <Text style={{ color: '#FFF8FC', fontSize: compact ? 20 : 22, lineHeight: 27, letterSpacing: 2.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {sceneClock(scene.updatedAt || scene.createdAt, copy.locale)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MapPin size={15} color="#FFF4FA" fill="rgba(255,244,250,0.18)" />
            <Text numberOfLines={1} style={{ flex: 1, color: '#FFF4FA', fontSize: 13, lineHeight: 18 }}>{location}</Text>
          </View>
          <Text numberOfLines={compact ? 2 : 2} style={{ color: 'rgba(255,244,250,0.86)', fontSize: compact ? 11.5 : 12.5, lineHeight: compact ? 17 : 19 }}>
            {atmosphere} · {scene.premise}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MeetingDocumentHeader({
  copy,
  scene,
  config,
  characters,
  userName,
  compact,
  mode = 'document',
}: {
  copy: MeetingCopy;
  scene: MeetingScene;
  config: MeetingConfig;
  characters: MeetingCharacterOption[];
  userName?: string;
  compact: boolean;
  mode?: 'document' | 'status';
}) {
  const [statusExpanded, setStatusExpanded] = useState(false);
  const cast = scene.castIds.flatMap(id => {
    const character = characters.find(candidate => candidate.id === id);
    return character ? [character] : [];
  });
  const narrative = config.narrative;
  const profileCompact = compact || narrative.layout === 'compact';
  const showProfile = narrative.layout !== 'pureNovel';
  const showAtmosphere = narrative.layout === 'profileNovel';
  const facts = collectStatusFacts(scene, characters, copy);
  const template = config.statusTemplate;
  const srcDoc = useMemo(() => buildMeetingInlineDocument({
    html: localizeStatusTemplate(template.html, copy),
    css: template.css,
    placeholders: {
      meta: { title: scene.title, premise: scene.premise, recap: scene.rollingRecap },
      scene: scene.status.scene,
      user: { name: userName ?? '' },
      cast: orderedCastForPlaceholders(scene, characters, scene.status),
      characters: characterMapForPlaceholders(scene.status),
    },
  }), [characters, copy, scene, template.css, template.html, userName]);
  const location = factValue(facts.sceneFacts, [/地点/u, /位置/u, /场所/u, /location/iu, /place/iu], copy.locale === 'zh-CN' ? '未定' : 'Undetermined');
  const atmosphere = factValue(facts.sceneFacts, [/气氛/u, /氛围/u, /天气/u, /atmosphere/iu, /mood/iu], copy.locale === 'zh-CN' ? '平静' : 'Calm');

  return (
    <View
      testID={mode === 'status' ? 'meeting-sticky-status' : 'meeting-scene-document-header'}
      accessibilityLabel={mode === 'status' ? copy.currentStatus : copy.storyLayout(narrative.layout)}
    >
      {mode === 'document' && showProfile ? (
        <View
          testID="meeting-scene-profile"
          style={{ minHeight: profileCompact ? 56 : 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: PAPER }}
        >
          <View testID="meeting-character-profile-header" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ProfileAvatarGroup cast={cast} compact={profileCompact} />
            <Text numberOfLines={2} selectable style={{ color: INK, fontSize: profileCompact ? 15 : 17, lineHeight: profileCompact ? 21 : 23, fontWeight: '700' }}>
              {cast.map(character => character.name).join(' · ') || copy.fellowTraveler}
            </Text>
          </View>
        </View>
      ) : null}

      {mode === 'status' ? <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0C9D2' }}>
        <View style={{ minHeight: 44, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkles size={17} color={ACCENT_DARK} />
          <Text style={{ color: INK, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{copy.currentStatus}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ minHeight: 44, paddingLeft: 8, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: compact ? 14 : 18 }}
        >
          {profileCompact ? (
            <Text numberOfLines={1} style={{ color: INK, fontSize: 12, lineHeight: 18 }}>
              {location} · {atmosphere}
            </Text>
          ) : (
            <>
              {facts.sceneFacts.map(fact => (
                <Text key={fact.id} numberOfLines={1} style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
                  {fact.label}　<Text style={{ color: INK }}>{fact.value}</Text>
                </Text>
              ))}
              {facts.characterFacts.map(fact => (
                <Text key={fact.id} numberOfLines={1} style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
                  {fact.label.split(' · ')[0]}　<Text style={{ color: INK }}>{fact.value}</Text>
                </Text>
              ))}
            </>
          )}
        </ScrollView>
        <ReadingIconButton
          label={statusExpanded ? copy.collapseStatus : copy.expandStatus}
          selected={statusExpanded}
          onPress={() => setStatusExpanded(value => !value)}
          icon={statusExpanded ? <ChevronUp size={18} color={ACCENT_DARK} /> : <ChevronDown size={18} color={ACCENT_DARK} />}
        />
      </View> : null}

      {mode === 'status' && statusExpanded ? (
        <View style={{ paddingHorizontal: compact ? 10 : 14, paddingVertical: 10, backgroundColor: PAPER_TINT }}>
          <View style={{ overflow: 'hidden', borderRadius: 10, borderCurve: 'continuous', backgroundColor: PAPER_SOFT }}>
            <MeetingHtmlPanel
              srcDoc={srcDoc}
              height={template.height}
              accessibilityLabel={facts.all.map(fact => `${fact.label}: ${fact.value}`).join('; ') || copy.currentSceneStatus}
            />
          </View>
        </View>
      ) : null}

      {mode === 'document' && showAtmosphere ? <AtmospherePanel copy={copy} scene={scene} location={location} atmosphere={atmosphere} compact={compact} /> : null}
    </View>
  );
}

function MiniTheaterEndnote({
  copy,
  scene,
  turn,
  characters,
  userName,
  compact,
}: {
  copy: MeetingCopy;
  scene: MeetingScene;
  turn: MeetingTurn;
  characters: MeetingCharacterOption[];
  userName?: string;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const theater = turn.miniTheater;
  const srcDoc = useMemo(() => theater ? buildMeetingInlineDocument({
    html: theater.html,
    css: theater.css,
    placeholders: {
      meta: { title: theater.title, content: theater.content, sceneTitle: scene.title },
      scene: turn.statusAfter.scene,
      user: { name: userName ?? '' },
      cast: orderedCastForPlaceholders(scene, characters, turn.statusAfter),
      characters: characterMapForPlaceholders(turn.statusAfter),
    },
  }) : '', [characters, scene, theater, turn.statusAfter, userName]);
  if (!theater) return null;

  return (
    <View style={{ marginTop: 20, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: '#EADEE8' }}>
      <AnimatedPressable
        testID="meeting-mini-theater-toggle"
        accessibilityRole="button"
        accessibilityLabel={expanded ? copy.collapseMiniTheater : copy.expandMiniTheater(theater.title)}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={{ minHeight: 48 }}
      >
        <View style={{ minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Clapperboard size={16} color={ACCENT} />
          <Text numberOfLines={1} style={{ flex: 1, color: ACCENT_DARK, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
            {copy.miniTheater}
          </Text>
          {expanded ? <ChevronUp size={16} color={ACCENT} /> : <ChevronDown size={16} color={ACCENT} />}
        </View>
      </AnimatedPressable>
      <Text selectable style={{ paddingHorizontal: 13, paddingBottom: 13, color: INK, fontSize: 14, lineHeight: 22 }}>
        {theater.content}
      </Text>
      {expanded ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          <View style={{ overflow: 'hidden', borderRadius: 8, borderCurve: 'continuous', backgroundColor: PAPER }}>
            <MeetingHtmlPanel
              srcDoc={srcDoc}
              height={Math.min(theater.height, compact ? 128 : 176)}
              accessibilityLabel={`${theater.title}。${theater.content}`}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ChapterAction({
  label,
  icon,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{ minHeight: 44, opacity: disabled ? 0.42 : 1 }}
    >
      <View style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon}
        <Text style={{ color: danger ? DANGER : MUTED, fontSize: 11.5, lineHeight: 16, fontWeight: '700' }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

function CharacterPassage({
  copy,
  character,
  text,
  compact,
  narrative,
  showIdentity,
}: {
  copy: MeetingCopy;
  character?: MeetingCharacterOption;
  text: string;
  compact: boolean;
  narrative: MeetingNarrative;
  showIdentity: boolean;
}) {
  const metrics = proseMetrics(narrative, compact);
  if (narrative.layout === 'compact') {
    return (
      <Text testID={`meeting-character-passage-${character?.id || 'unknown'}`} selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>
        {showIdentity ? <Text style={{ color: ACCENT, fontWeight: '700' }}>{character?.name || copy.fellowTraveler}: </Text> : null}{text}
      </Text>
    );
  }
  if (narrative.layout === 'pureNovel') {
    return (
      <View testID={`meeting-character-passage-${character?.id || 'unknown'}`} style={{ gap: 5 }}>
        {showIdentity ? <Text selectable style={{ color: ACCENT, fontSize: 15, lineHeight: 21, fontWeight: '700' }}>{character?.name || copy.fellowTraveler}</Text> : null}
        <Text selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>{text}</Text>
      </View>
    );
  }
  if (compact) {
    return (
      <View testID={`meeting-character-passage-${character?.id || 'unknown'}`} style={{ gap: 8 }}>
        {showIdentity ? <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MeetingAvatar character={character} size={28} variant="profile" />
          <Text selectable style={{ color: ACCENT, fontSize: 15, lineHeight: 21, fontWeight: '700' }}>{character?.name || copy.fellowTraveler}</Text>
        </View> : null}
        <Text selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>{text}</Text>
      </View>
    );
  }

  return (
    <View testID={`meeting-character-passage-${character?.id || 'unknown'}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      {showIdentity ? <MeetingAvatar character={character} size={32} variant="profile" /> : <View style={{ width: 32 }} />}
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1, gap: 6 }}>
        {showIdentity ? <Text selectable style={{ color: ACCENT, fontSize: 15, lineHeight: 21, fontWeight: '700' }}>{character?.name || copy.fellowTraveler}</Text> : null}
        <Text selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>{text}</Text>
      </View>
    </View>
  );
}

function NovelTurn({
  copy,
  scene,
  config,
  turn,
  characters,
  userName,
  compact,
  readOnly,
  isLatest,
  busy,
  adapter,
}: {
  copy: MeetingCopy;
  scene: MeetingScene;
  config: MeetingConfig;
  turn: MeetingTurn;
  characters: MeetingCharacterOption[];
  userName?: string;
  compact: boolean;
  readOnly: boolean;
  isLatest: boolean;
  busy?: boolean;
  adapter?: MeetingModelAdapter;
}) {
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editText, setEditText] = useState(turn.input);
  const narrative = config.narrative;
  const metrics = proseMetrics(narrative, compact);
  const failed = turn.state === 'failed';
  const isOpeningTurn = turn.index === 1 && turn.input === '__NANA_MEETING_OPENING__';
  const quote = narrative.showLeadQuote ? turn.leadQuote?.trim() || '' : '';
  const shownCharacterIds = new Set<string>();
  const canGenerateMiniTheater = !readOnly
    && config.miniTheater.mode === 'manual'
    && !turn.miniTheater
    && !!adapter?.generateMiniTheater;
  const chapterTitle = narrative.showChapterTitle
    ? turn.chapterTitle || (turn.index === 1 ? scene.title : '')
    : '';
  const saveEdit = () => {
    const value = editText.trim();
    if (!value || value === turn.input) {
      setEditing(false);
      setEditText(turn.input);
      return;
    }
    void adapter?.editTurn?.(scene.id, turn.id, value);
    setEditing(false);
  };

  return (
    <View
      testID={`meeting-novel-turn-${turn.index}`}
      style={{ paddingHorizontal: compact ? 14 : 16, paddingTop: metrics.turnPadding, paddingBottom: metrics.turnPadding }}
    >
      <View style={{ alignItems: 'center', gap: 5 }}>
        <Text style={{ color: MUTED, fontSize: 11.5, lineHeight: 17, fontWeight: '700' }}>{copy.actNumber(turn.index)}</Text>
        {chapterTitle ? (
          <Text selectable style={{ color: ACCENT, fontSize: compact ? 20 : 24, lineHeight: compact ? 30 : 32, fontWeight: '500', textAlign: 'center' }}>
            {chapterTitle}
          </Text>
        ) : null}
        {quote ? (
          <Text selectable style={{ color: ACCENT, fontSize: compact ? 20 : 24, lineHeight: compact ? 29 : 35, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: compact ? 0 : 8, paddingTop: 10 }}>
            “{quote}”
          </Text>
        ) : null}
        {!readOnly ? (
          <AnimatedPressable
            testID={`meeting-turn-actions-toggle-${turn.index}`}
            accessibilityRole="button"
            accessibilityLabel={actionsOpen ? copy.collapseActActions(turn.index) : copy.openActActions(turn.index)}
            accessibilityState={{ expanded: actionsOpen }}
            onPress={() => setActionsOpen(value => !value)}
            style={{ minWidth: 88, minHeight: 44 }}
          >
            <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <View style={{ width: 28, height: 1, backgroundColor: RULE }} />
              <Sparkles size={13} color="#C59AAF" />
              <View style={{ width: 28, height: 1, backgroundColor: RULE }} />
            </View>
          </AnimatedPressable>
        ) : (
          <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <View style={{ width: 28, height: 1, backgroundColor: RULE }} />
            <Sparkles size={13} color="#C59AAF" />
            <View style={{ width: 28, height: 1, backgroundColor: RULE }} />
          </View>
        )}
      </View>

      {!isOpeningTurn ? (
        <View style={{ paddingBottom: 18 }}>
          {editing ? (
            <View style={{ backgroundColor: PAPER_SOFT, borderRadius: 10, borderCurve: 'continuous' }}>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                accessibilityLabel={copy.editTurnInput}
                style={{ minHeight: 84, padding: 12, color: INK, fontFamily: SERIF_REGULAR, fontSize: 15, lineHeight: 24, textAlignVertical: 'top' }}
              />
            </View>
          ) : (
            <View style={{ paddingLeft: narrative.layout === 'profileNovel' ? compact ? 44 : 50 : 0 }}>
              <Text style={{ color: ACCENT, fontSize: 12, lineHeight: 17, fontWeight: '700', paddingBottom: 4 }}>{userName?.trim() || copy.you}</Text>
              <Text selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>{turn.input}</Text>
            </View>
          )}
        </View>
      ) : null}

      {turn.generationSource === 'demo' ? (
        <Text style={{ color: SOFT, fontSize: 10.5, lineHeight: 16, textAlign: 'center', paddingBottom: 12 }}>{copy.localDemoDirector}</Text>
      ) : null}

      <View style={{ gap: metrics.gap }}>
        {turn.blocks.map(block => {
          if (block.kind === 'narration') {
            return <Text key={block.id} selectable style={{ color: INK, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}>{block.text}</Text>;
          }
          const character = characters.find(candidate => candidate.id === block.characterId);
          const characterKey = block.characterId || 'unknown';
          const showIdentity = !shownCharacterIds.has(characterKey);
          shownCharacterIds.add(characterKey);
          return <CharacterPassage key={block.id} copy={copy} character={character} text={block.text} compact={compact} narrative={narrative} showIdentity={showIdentity} />;
        })}
      </View>

      {failed ? (
        <Text accessibilityLiveRegion="polite" selectable style={{ color: DANGER, fontSize: 12, lineHeight: 19, paddingTop: 16 }}>
          {copy.failedAct}
        </Text>
      ) : null}

      {actionsOpen && !readOnly ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 12, columnGap: 2 }}>
          {editing ? (
            <ChapterAction label={copy.saveChanges} onPress={saveEdit} disabled={busy} icon={<Pencil size={14} color={MUTED} />} />
          ) : (
            <>
              {canGenerateMiniTheater ? <ChapterAction label={copy.generateMiniTheater} onPress={() => void adapter?.generateMiniTheater?.(scene.id, turn.id)} disabled={busy} icon={<Clapperboard size={14} color={ACCENT} />} /> : null}
              {!isOpeningTurn ? <ChapterAction label={copy.editAct} onPress={() => setEditing(true)} disabled={busy || !adapter?.editTurn} icon={<Pencil size={14} color={MUTED} />} /> : null}
              {isLatest ? <ChapterAction label={copy.retryAct} onPress={() => void adapter?.retryTurn?.(scene.id, turn.id)} disabled={busy || !adapter?.retryTurn} icon={<RotateCcw size={14} color={MUTED} />} /> : null}
              {!isOpeningTurn ? <ChapterAction label={copy.deleteAct} onPress={() => void adapter?.deleteTurn?.(scene.id, turn.id)} disabled={busy || !adapter?.deleteTurn} danger icon={<Trash2 size={14} color={DANGER} />} /> : null}
            </>
          )}
        </View>
      ) : null}

      <MiniTheaterEndnote copy={copy} scene={scene} turn={turn} characters={characters} userName={userName} compact={compact} />
    </View>
  );
}

function MeetingComposer({
  copy,
  sceneId,
  busy,
  error,
  adapter,
}: {
  copy: MeetingCopy;
  sceneId: string;
  busy?: boolean;
  error?: string | null;
  adapter?: MeetingModelAdapter;
}) {
  const [text, setText] = useState('');
  const send = async () => {
    const value = text.trim();
    if (!value || busy || !adapter?.sendTurn) return;
    await adapter.sendTurn(sceneId, value);
    setText('');
  };
  const enabled = !!text.trim() && !busy && !!adapter?.sendTurn;
  return (
    <View testID="meeting-composer" style={{ minHeight: 72, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, backgroundColor: PAPER, borderTopWidth: 1, borderTopColor: RULE, gap: 5 }}>
      {busy || error ? (
        <Text numberOfLines={1} accessibilityLiveRegion="polite" selectable style={{ color: error ? DANGER : MUTED, fontSize: 11.5, lineHeight: 17 }}>
          {error || copy.generatingResponse}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, minHeight: 48, borderRadius: 24, borderCurve: 'continuous', backgroundColor: PAPER_SOFT, borderWidth: 1, borderColor: RULE }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={copy.composerPlaceholder}
            placeholderTextColor={SOFT}
            multiline
            maxLength={1200}
            editable={!busy}
            accessibilityLabel={copy.composerLabel}
            style={{ minHeight: 48, maxHeight: 100, paddingHorizontal: 15, paddingVertical: 12, color: INK, fontFamily: SERIF_REGULAR, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' }}
          />
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={copy.sendAct}
          accessibilityState={{ disabled: !enabled }}
          onPress={enabled ? () => void send() : undefined}
          disabled={!enabled}
          scale={0.95}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: enabled ? ACCENT : '#DDBECB', marginBottom: 2 }}
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Send size={19} color="#FFF9FC" strokeWidth={1.9} />
          </View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export function MeetingSceneScreen({
  scene,
  characters,
  userName,
  compact,
  busy,
  error,
  modelAdapter,
  onBack,
  onReview,
  onDeleteScene,
}: MeetingSceneScreenProps) {
  const copy = useMeetingCopy();
  const listRef = useRef<FlashListRef<MeetingTurn>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const config = useMemo(
    () => normalizeMeetingConfig(scene.presetSnapshot.meetingConfig),
    [scene.presetSnapshot.meetingConfig],
  );
  const readOnly = scene.state !== 'active';
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(timer);
  }, [scene.id, scene.turns.length]);
  const endScene = async () => {
    setMenuOpen(false);
    await modelAdapter?.endScene?.(scene.id);
    onReview();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <MeetingNavigation copy={copy} compact={compact} menuOpen={menuOpen} onBack={onBack} onToggleMenu={() => setMenuOpen(value => !value)} />
        {menuOpen ? (
          <SceneMenu
            copy={copy}
            readOnly={readOnly}
            busy={busy}
            canEnd={!!modelAdapter?.endScene}
            canDelete={!!onDeleteScene}
            onReview={() => { setMenuOpen(false); onReview(); }}
            onEnd={() => void endScene()}
            onDelete={onDeleteScene ? () => { setMenuOpen(false); onDeleteScene(); } : undefined}
          />
        ) : null}

        <View
          testID={`meeting-layout-${config.narrative.layout}`}
          accessibilityLabel={copy.storyLayout(config.narrative.layout)}
          style={{
            flex: 1,
            minHeight: 0,
            marginHorizontal: compact ? 8 : 12,
            marginBottom: compact ? 6 : 12,
            borderRadius: compact ? 16 : 18,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: PAPER,
          }}
        >
          <MeetingDocumentHeader copy={copy} scene={scene} config={config} characters={characters} userName={userName} compact={compact} mode="status" />
          <FlashList
            ref={listRef}
            data={scene.turns}
            keyExtractor={turn => turn.id}
            renderItem={({ item, index }) => (
              <NovelTurn
                copy={copy}
                scene={scene}
                config={config}
                turn={item}
                characters={characters}
                userName={userName}
                compact={compact}
                readOnly={readOnly}
                isLatest={index === scene.turns.length - 1}
                busy={busy}
                adapter={modelAdapter}
              />
            )}
            ListHeaderComponent={<MeetingDocumentHeader copy={copy} scene={scene} config={config} characters={characters} userName={userName} compact={compact} mode="document" />}
            ListEmptyComponent={(
              <View style={{ paddingVertical: 42, paddingHorizontal: 24, alignItems: 'center', gap: 8 }}>
                <Text style={{ color: INK, fontSize: 17, fontWeight: '800' }}>{copy.storyBeforeStart}</Text>
                <Text style={{ color: MUTED, fontSize: 13, lineHeight: 21, textAlign: 'center' }}>
                  {readOnly ? copy.noStory : copy.firstAction}
                </Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, marginHorizontal: compact ? 16 : 20, backgroundColor: RULE }} />}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 22 }}
            onLoad={() => listRef.current?.scrollToEnd({ animated: false })}
          />

          {readOnly ? (
            <View style={{ minHeight: 58, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: PAPER, borderTopWidth: 1, borderTopColor: RULE }}>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={copy.reviewAndConfirm} onPress={onReview} style={{ minHeight: 44, borderRadius: 22, backgroundColor: PAPER_TINT }}>
                <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <BookHeart size={17} color={ACCENT_DARK} />
                  <Text style={{ color: ACCENT_DARK, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>{copy.reviewAndConfirm}</Text>
                </View>
              </AnimatedPressable>
            </View>
          ) : (
            <MeetingComposer copy={copy} sceneId={scene.id} busy={busy} error={error} adapter={modelAdapter} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
