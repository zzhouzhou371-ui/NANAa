import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronUp, Sparkles } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/primitives';
import {
  MeetingAvatar,
  MeetingButton,
  MeetingHeader,
  MeetingIconButton,
  MeetingSurface,
  SectionLabel,
  meetingColors,
} from './meeting-ui-kit';
import type {
  MeetingCharacterOption,
  MeetingCreateInput,
  MeetingHandoffDraft,
  MeetingPresetOption,
} from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

export function MeetingHandoffScreen({
  draft,
  characters,
  presets,
  userPersona,
  compact,
  busy,
  error,
  onBack,
  onCreate,
}: {
  draft: MeetingHandoffDraft;
  characters: MeetingCharacterOption[];
  presets: MeetingPresetOption[];
  userPersona?: string;
  compact: boolean;
  busy?: boolean;
  error?: string | null;
  onBack: () => void;
  onCreate: (input: MeetingCreateInput) => void;
}) {
  const copy = useMeetingCopy();
  const [castIds, setCastIds] = useState(draft.castIds);
  const [title, setTitle] = useState(draft.title);
  const [premise, setPremise] = useState(draft.premise);
  const [presetId, setPresetId] = useState(draft.presetId || presets[0]?.id || '');
  const [presetExpanded, setPresetExpanded] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [premiseEdited, setPremiseEdited] = useState(false);
  const [validation, setValidation] = useState('');
  const sourceCharacterId = draft.chatId;

  useEffect(() => {
    if (!titleEdited) setTitle(draft.title);
    if (!premiseEdited) setPremise(draft.premise);
  }, [draft.premise, draft.title, premiseEdited, titleEdited]);

  const selectedNames = useMemo(() => castIds.map(id => (
    characters.find(character => character.id === id)?.name
  )).filter(Boolean).join(copy.listSeparator), [castIds, characters, copy.listSeparator]);

  const toggleCast = (characterId: string) => {
    setValidation('');
    if (characterId === sourceCharacterId) return;
    setCastIds(current => {
      if (current.includes(characterId)) return current.filter(id => id !== characterId);
      if (current.length >= 4) {
        setValidation(copy.maxCast);
        return current;
      }
      return [...current, characterId];
    });
  };

  const submit = () => {
    if (!castIds.length) {
      setValidation(copy.keepAtLeastOne);
      return;
    }
    if (!premise.trim()) {
      setValidation(copy.confirmPremise);
      return;
    }
    if (!presetId) {
      setValidation(copy.selectOfflinePreset);
      return;
    }
    setValidation('');
    onCreate({
      castIds,
      title: title.trim() || undefined,
      premise: premise.trim(),
      playerSupplement: '',
      presetId,
      userPersona: userPersona?.trim() || undefined,
      origin: {
        type: 'chatHandoff',
        chatId: draft.chatId,
        sourceMessageIds: draft.sourceMessageIds,
        ...(draft.sourceTurnId ? { sourceTurnId: draft.sourceTurnId } : {}),
        label: draft.sourceLabel,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <MeetingHeader
        compact={compact}
        title={copy.confirmRsvp}
        subtitle={draft.preparing ? copy.preparingRecentChat : draft.sourceLabel}
        left={<MeetingIconButton label={copy.backToChat} onPress={onBack} icon={<ChevronLeft size={21} color={meetingColors.ink} />} />}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: compact ? 12 : 16, paddingTop: 8, paddingBottom: 28, gap: 18 }}
      >
        <MeetingSurface tone="champagnePink" depth="raisedSmall" radius={16} contentStyle={{ padding: 14, gap: 6 }}>
          <Text style={{ color: meetingColors.ink, fontSize: 17, lineHeight: 22, fontWeight: '800' }}>
            {copy.handoffReadyTitle}
          </Text>
          <Text style={{ color: meetingColors.inkMuted, fontSize: 13, lineHeight: 20 }}>
            {copy.handoffReadyBody}
          </Text>
        </MeetingSurface>

        <View style={{ gap: 9 }}>
          <SectionLabel>{copy.whoJoin}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {characters.map(character => {
              const selected = castIds.includes(character.id);
              const required = character.id === sourceCharacterId;
              return (
                <AnimatedPressable
                  key={character.id}
                  testID={required ? 'meeting-handoff-source-character' : undefined}
                  accessibilityRole="checkbox"
                  accessibilityLabel={required ? copy.currentChatCharacter(character.name) : copy.inviteCharacter(character.name)}
                  accessibilityState={{ checked: selected, disabled: required }}
                  onPress={() => toggleCast(character.id)}
                  scale={0.975}
                  style={{ width: '48.5%', minHeight: 62, borderRadius: 16 }}
                >
                  <MeetingSurface
                    tone={selected ? 'champagnePink' : 'lavender'}
                    radius={16}
                    contentStyle={{ minHeight: 62, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <MeetingAvatar character={character} size={38} />
                    <Text numberOfLines={1} style={{ flex: 1, color: meetingColors.ink, fontSize: 13, fontWeight: '800' }}>
                      {character.name}
                    </Text>
                    {selected ? (
                      <View testID={required ? 'meeting-handoff-source-selected-indicator' : undefined}>
                        <Check size={15} color={meetingColors.relationship} />
                      </View>
                    ) : null}
                  </MeetingSurface>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <SectionLabel>{copy.meetingTitle}</SectionLabel>
          <MeetingSurface tone="lavender" depth="inset" radius={14}>
            <TextInput
              value={title}
              onChangeText={value => { setTitleEdited(true); setTitle(value); }}
              maxLength={80}
              accessibilityLabel={copy.meetingTitle}
              style={{ minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, color: meetingColors.ink, fontSize: 14 }}
            />
          </MeetingSurface>
        </View>

        <View style={{ gap: 8 }}>
          <SectionLabel>{copy.meetingPremise}</SectionLabel>
          <MeetingSurface tone="lavender" depth="inset" radius={14}>
            <TextInput
              value={premise}
              onChangeText={value => { setPremiseEdited(true); setPremise(value); }}
              multiline
              maxLength={1200}
              accessibilityLabel={copy.meetingPremise}
              style={{ minHeight: 104, paddingHorizontal: 14, paddingVertical: 12, color: meetingColors.ink, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' }}
            />
          </MeetingSurface>
        </View>

        <MeetingSurface tone="lavender" depth="raisedSmall" radius={16}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={presetExpanded ? copy.collapsePreset : copy.changePreset}
            accessibilityState={{ expanded: presetExpanded }}
            onPress={() => setPresetExpanded(value => !value)}
            style={{ minHeight: 48 }}
          >
            <View style={{ minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: meetingColors.ink, fontSize: 13, fontWeight: '800' }}>
                {copy.selectedPreset(presets.find(preset => preset.id === presetId)?.name || copy.noneSelected)}
              </Text>
              {presetExpanded ? <ChevronUp size={17} color={meetingColors.inkMuted} /> : <ChevronDown size={17} color={meetingColors.inkMuted} />}
            </View>
          </AnimatedPressable>
          {presetExpanded ? (
            <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 7 }}>
              {presets.map(preset => (
                <MeetingButton
                  key={preset.id}
                  label={preset.name}
                  compact
                  onPress={() => { setPresetId(preset.id); setPresetExpanded(false); }}
                  tone={preset.id === presetId ? 'pinkGold' : 'mist'}
                />
              ))}
            </View>
          ) : null}
        </MeetingSurface>

        {validation || error ? (
          <Text accessibilityLiveRegion="polite" selectable style={{ color: '#FFE1EA', fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
            {validation || error}
          </Text>
        ) : null}

        <MeetingButton
          label={busy ? copy.generatingOpening : copy.startWith(selectedNames)}
          icon={<Sparkles size={17} color="#FFF9FF" />}
          onPress={submit}
          disabled={!!busy || draft.preparing}
          tone="berry"
          textColor="#FFF9FF"
        />
      </ScrollView>
    </View>
  );
}
