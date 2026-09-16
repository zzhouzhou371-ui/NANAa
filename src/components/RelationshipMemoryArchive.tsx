import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Brain, Check, ChevronDown, ChevronUp, CircleSlash2, PencilLine } from 'lucide-react-native';
import type { RelationshipTrace, RelationshipTraceSource } from '../types';
import type { TranslationDict } from '../i18n';
import { buildRelationshipMemoryArchive } from '../features/memory/relationship-memory-archive-model';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const PAGE_SIZE = 12;

interface RelationshipMemoryArchiveProps {
  characterId: string;
  characterName: string;
  traces: RelationshipTrace[];
  locale: 'en' | 'zh';
  t: TranslationDict;
  onCorrect: (traceId: string, summary: string) => boolean;
  onToggleRemember: (trace: RelationshipTrace) => void;
}

const replaceCount = (template: string, count: number) => (
  template.replace('{n}', String(count))
);

const sourceLabel = (
  source: RelationshipTraceSource,
  t: TranslationDict,
): string => ({
  chat: t.traceChat,
  voiceMessage: t.traceVoiceMessage,
  photo: t.tracePhoto,
  payment: t.tracePayment,
  voiceCall: t.traceVoiceCall,
  videoCall: t.traceVideoCall,
  moment: t.traceMoment,
  offlineScene: t.traceOfflineScene,
})[source];

function ArchivePill({
  label,
  emphasized = false,
}: {
  label: string;
  emphasized?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: 24,
        justifyContent: 'center',
        borderRadius: 999,
        paddingHorizontal: 9,
        backgroundColor: emphasized
          ? 'rgba(150,81,106,0.14)'
          : 'rgba(255,249,255,0.20)',
        borderWidth: 1,
        borderColor: emphasized
          ? 'rgba(150,81,106,0.28)'
          : 'rgba(255,249,255,0.24)',
      }}
    >
      <Text
        style={{
          color: emphasized ? neumorphicPalette.berry : neumorphicPalette.onLightSecondary,
          fontSize: 10,
          fontWeight: '800',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ArchiveAction({
  label,
  onPress,
  destructive = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        borderRadius: 999,
        paddingHorizontal: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: destructive
          ? neumorphicPalette.berry
          : 'rgba(255,249,255,0.22)',
        borderWidth: destructive ? 0 : 1,
        borderColor: 'rgba(255,249,255,0.32)',
      }}
    >
      {icon}
      <Text
        style={{
          color: destructive ? neumorphicPalette.onBerry : neumorphicPalette.onLightPrimary,
          fontSize: 11,
          fontWeight: '800',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function traceStateLabel(trace: RelationshipTrace, t: TranslationDict) {
  if (!trace.remember || trace.state === 'ignored') return t.memoryTraceIgnored;
  if (trace.state === 'failed') return t.memoryTraceFailed;
  if (trace.state === 'pending') return t.memoryTracePending;
  return t.memoryTraceRemembered;
}

export function RelationshipMemoryArchive({
  characterId,
  characterName,
  traces,
  locale,
  t,
  onCorrect,
  onToggleRemember,
}: RelationshipMemoryArchiveProps) {
  const archive = useMemo(
    () => buildRelationshipMemoryArchive(traces, characterId),
    [characterId, traces],
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [editingTraceId, setEditingTraceId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [correctionError, setCorrectionError] = useState(false);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedTraceId(null);
    setEditingTraceId(null);
    setCorrectionDraft('');
    setCorrectionError(false);
  }, [characterId]);

  const startCorrection = (trace: RelationshipTrace) => {
    setExpandedTraceId(trace.id);
    setEditingTraceId(trace.id);
    setCorrectionDraft(trace.summary);
    setCorrectionError(false);
  };

  const cancelCorrection = () => {
    setEditingTraceId(null);
    setCorrectionDraft('');
    setCorrectionError(false);
  };

  const saveCorrection = (trace: RelationshipTrace) => {
    const summary = correctionDraft.trim();
    if (!summary || !onCorrect(trace.id, summary)) {
      setCorrectionError(true);
      return;
    }
    setEditingTraceId(null);
    setCorrectionDraft('');
    setCorrectionError(false);
  };

  if (archive.items.length === 0) {
    return (
      <NeumorphicSurface
        depth="inset"
        tone="lavender"
        radius={18}
        style={{ marginBottom: 22 }}
        contentStyle={{ paddingHorizontal: 15, paddingVertical: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Brain size={18} color={neumorphicPalette.onLightSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
              {t.memoryArchiveEmptyTitle}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
              {t.sharedMemoryEmpty}
            </Text>
          </View>
        </View>
      </NeumorphicSurface>
    );
  }

  const visibleItems = archive.items.slice(0, visibleCount);
  const remaining = Math.max(0, archive.items.length - visibleItems.length);

  return (
    <View style={{ marginBottom: 22 }}>
      <NeumorphicSurface
        depth="raisedSmall"
        tone="champagnePink"
        radius={18}
        style={{ marginBottom: 16 }}
        contentStyle={{ paddingHorizontal: 14, paddingVertical: 13 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,249,255,0.24)',
            }}
          >
            <Brain size={18} color={neumorphicPalette.berry} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '900' }}>
              {t.memoryArchiveTitle.replace('{name}', characterName)}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, lineHeight: 15, marginTop: 2 }}>
              {replaceCount(t.memoryArchiveSummary, archive.stats.total)
                .replace('{remembered}', String(archive.stats.remembered))
                .replace('{verified}', String(archive.stats.verified))}
            </Text>
          </View>
        </View>
      </NeumorphicSurface>

      {visibleItems.map((trace, index) => {
        const expanded = expandedTraceId === trace.id;
        const editing = editingTraceId === trace.id;
        const ignored = !trace.remember || trace.state === 'ignored';
        const dateLabel = new Date(trace.occurredAt).toLocaleString(
          locale === 'zh' ? 'zh-CN' : 'en',
          { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
        );

        return (
          <View key={trace.id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            <View style={{ width: 22, alignItems: 'center' }}>
              {index > 0 ? (
                <View style={{ position: 'absolute', top: 0, width: 1, height: 13, backgroundColor: 'rgba(255,249,255,0.32)' }} />
              ) : null}
              {index < visibleItems.length - 1 || remaining > 0 ? (
                <View style={{ position: 'absolute', top: 13, bottom: 0, width: 1, backgroundColor: 'rgba(255,249,255,0.32)' }} />
              ) : null}
              <View
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  marginTop: 9,
                  zIndex: 1,
                  backgroundColor: ignored
                    ? neumorphicPalette.soft
                    : trace.userVerified
                      ? neumorphicPalette.berry
                      : neumorphicPalette.pinkGold,
                  borderWidth: 2,
                  borderColor: 'rgba(255,249,255,0.76)',
                }}
              />
            </View>

            <NeumorphicSurface
              depth={ignored ? 'inset' : 'raisedSmall'}
              tone={ignored ? 'lavender' : 'pinkGold'}
              radius={17}
              style={{ flex: 1, marginLeft: 5, marginBottom: 13, opacity: ignored ? 0.82 : 1 }}
              contentStyle={{ paddingHorizontal: 13, paddingVertical: 12 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                  <ArchivePill label={sourceLabel(trace.source, t)} emphasized />
                  <ArchivePill label={trace.origin.mode === 'offline' ? t.memoryTraceOffline : t.memoryTraceOnline} />
                  <ArchivePill label={trace.userVerified ? t.memoryTraceVerified : t.memoryTraceAutomatic} emphasized={trace.userVerified} />
                  <ArchivePill label={traceStateLabel(trace, t)} />
                </View>
              </View>

              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, marginTop: 8 }}>
                {dateLabel}
              </Text>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '900', lineHeight: 18, marginTop: 4 }}>
                {trace.title || sourceLabel(trace.source, t)}
              </Text>

              {editing ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
                    {t.memoryTraceCorrectionLabel}
                  </Text>
                  <NeumorphicSurface
                    depth="inset"
                    tone="lavender"
                    radius={14}
                    contentStyle={{ paddingHorizontal: 11, paddingVertical: 10 }}
                  >
                    <TextInput
                      accessibilityLabel={t.memoryTraceCorrectionLabel}
                      value={correctionDraft}
                      onChangeText={(value) => {
                        setCorrectionDraft(value);
                        setCorrectionError(false);
                      }}
                      multiline
                      maxLength={4000}
                      placeholder={t.memoryTraceCorrectionPlaceholder}
                      placeholderTextColor={neumorphicPalette.onLightSecondary}
                      style={{
                        minHeight: 104,
                        color: neumorphicPalette.onLightPrimary,
                        fontSize: 13,
                        lineHeight: 19,
                        padding: 0,
                        textAlignVertical: 'top',
                      }}
                    />
                  </NeumorphicSurface>
                  <Text style={{ color: correctionError ? neumorphicPalette.berry : neumorphicPalette.onLightSecondary, fontSize: 10, lineHeight: 15, marginTop: 6 }}>
                    {correctionError ? t.memoryTraceCorrectionFailed : t.memoryTraceCorrectionTrustHint}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
                    <ArchiveAction label={t.memoryTraceCancelCorrection} onPress={cancelCorrection} />
                    <ArchiveAction
                      label={t.memoryTraceSaveCorrection}
                      onPress={() => saveCorrection(trace)}
                      icon={<Check size={13} color={neumorphicPalette.onLightPrimary} />}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Text
                    numberOfLines={expanded ? undefined : 3}
                    style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, lineHeight: 18, marginTop: 7 }}
                  >
                    {trace.summary || t.memoryTraceNoSummary}
                  </Text>
                  {expanded && trace.tone ? (
                    <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, lineHeight: 15, marginTop: 7 }}>
                      {t.memoryTraceTone}: {trace.tone}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                    <ArchiveAction
                      label={expanded ? t.memoryTraceCollapse : t.memoryTraceExpand}
                      onPress={() => setExpandedTraceId(expanded ? null : trace.id)}
                      icon={expanded
                        ? <ChevronUp size={13} color={neumorphicPalette.onLightPrimary} />
                        : <ChevronDown size={13} color={neumorphicPalette.onLightPrimary} />}
                    />
                    <ArchiveAction
                      label={t.memoryTraceCorrect}
                      onPress={() => startCorrection(trace)}
                      icon={<PencilLine size={12} color={neumorphicPalette.onLightPrimary} />}
                    />
                    <ArchiveAction
                      label={ignored ? t.memoryTraceRememberAgain : t.memoryTraceIgnore}
                      onPress={() => onToggleRemember(trace)}
                      destructive={!ignored}
                      icon={<CircleSlash2 size={12} color={ignored ? neumorphicPalette.onLightPrimary : neumorphicPalette.onBerry} />}
                    />
                  </View>
                </>
              )}
            </NeumorphicSurface>
          </View>
        );
      })}

      {remaining > 0 ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={replaceCount(t.memoryTraceShowMore, remaining)}
          onPress={() => setVisibleCount(count => count + PAGE_SIZE)}
          style={{ minHeight: 44, marginLeft: 27, borderRadius: 999 }}
        >
          <NeumorphicSurface
            pointerEvents="none"
            depth="raisedSmall"
            tone="lavender"
            radius={999}
            style={{ position: 'absolute', inset: 0 }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}
          >
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '800' }}>
              {replaceCount(t.memoryTraceShowMore, remaining)}
            </Text>
          </NeumorphicSurface>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
