import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ChevronLeft, Sparkles } from 'lucide-react-native';
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
  MeetingPresetOption,
} from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

interface MeetingCreateScreenProps {
  characters: MeetingCharacterOption[];
  presets: MeetingPresetOption[];
  userPersona?: string;
  compact: boolean;
  busy?: boolean;
  canCreate?: boolean;
  error?: string | null;
  onBack: () => void;
  onCreate: (input: MeetingCreateInput) => void;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>{label}</SectionLabel>
      <MeetingSurface tone="lavender" depth="inset" radius={14}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={meetingColors.inkSoft}
          multiline={multiline}
          maxLength={multiline ? 1200 : 80}
          accessibilityLabel={label}
          style={{
            minHeight: multiline ? 88 : 46,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 12 : 10,
            color: meetingColors.ink,
            fontSize: 14,
            lineHeight: 21,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </MeetingSurface>
    </View>
  );
}

export function MeetingCreateScreen({
  characters,
  presets,
  userPersona,
  compact,
  busy,
  canCreate = true,
  error,
  onBack,
  onCreate,
}: MeetingCreateScreenProps) {
  const copy = useMeetingCopy();
  const [castIds, setCastIds] = useState<string[]>([]);
  const [premise, setPremise] = useState('');
  const [title, setTitle] = useState('');
  const [sceneSupplement, setSceneSupplement] = useState('');
  const [presetId, setPresetId] = useState(() => presets[0]?.id ?? '');
  const [validation, setValidation] = useState('');

  const selectedNames = useMemo(
    () => castIds.map(id => characters.find(character => character.id === id)?.name).filter(Boolean).join(copy.listSeparator),
    [castIds, characters, copy.listSeparator],
  );

  const toggleCast = (characterId: string) => {
    setValidation('');
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
    if (castIds.length < 1) {
      setValidation(copy.selectAtLeastOne);
      return;
    }
    if (!premise.trim()) {
      setValidation(copy.needPremise);
      return;
    }
    if (!presetId) {
      setValidation(copy.selectOfflinePreset);
      return;
    }
    setValidation('');
    onCreate({
      castIds,
      premise: premise.trim(),
      title: title.trim() || undefined,
      playerSupplement: sceneSupplement.trim(),
      presetId,
      userPersona: userPersona?.trim() || undefined,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <MeetingHeader
        compact={compact}
        title={copy.createTitle}
        subtitle={selectedNames || copy.inviteSubtitle}
        left={<MeetingIconButton label={copy.backToList} onPress={onBack} icon={<ChevronLeft size={21} color={meetingColors.ink} />} />}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: compact ? 12 : 16, paddingTop: 8, paddingBottom: 28, gap: 18 }}
      >
        <View style={{ gap: 9 }}>
          <SectionLabel>{copy.whoMeeting}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {characters.map(character => {
              const selected = castIds.includes(character.id);
              return (
                <AnimatedPressable
                  key={character.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={copy.inviteCharacter(character.name)}
                  accessibilityState={{ checked: selected }}
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
                    {selected ? <Check size={15} color={meetingColors.relationship} /> : null}
                  </MeetingSurface>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        <Field
          label={copy.whyHere}
          value={premise}
          onChangeText={setPremise}
          placeholder={copy.premisePlaceholder}
          multiline
        />
        <Field
          label={copy.titleOptional}
          value={title}
          onChangeText={setTitle}
          placeholder={copy.titlePlaceholder}
        />
        <Field
          label={copy.supplementOptional}
          value={sceneSupplement}
          onChangeText={setSceneSupplement}
          placeholder={copy.supplementPlaceholder}
          multiline
        />

        <View style={{ gap: 9 }}>
          <SectionLabel>{copy.offlinePreset}</SectionLabel>
          <View style={{ gap: 8 }}>
            {presets.map(preset => {
              const selected = preset.id === presetId;
              return (
                <AnimatedPressable
                  key={preset.id}
                  accessibilityRole="radio"
                  accessibilityLabel={preset.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setPresetId(preset.id)}
                  scale={0.98}
                  style={{ minHeight: 54, borderRadius: 16 }}
                >
                  <MeetingSurface
                    tone={selected ? 'pinkGold' : 'lavender'}
                    radius={16}
                    contentStyle={{ minHeight: 54, paddingHorizontal: 13, paddingVertical: 10, gap: 3 }}
                  >
                    <Text style={{ color: meetingColors.ink, fontSize: 14, fontWeight: '800' }}>{preset.name}</Text>
                    {preset.sceneDescription ? (
                      <Text numberOfLines={2} style={{ color: meetingColors.inkMuted, fontSize: 12, lineHeight: 17 }}>
                        {preset.sceneDescription}
                      </Text>
                    ) : null}
                  </MeetingSurface>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {userPersona?.trim() ? (
          <Text selectable style={{ color: 'rgba(255,249,255,0.78)', fontSize: 12, lineHeight: 18 }}>
            {copy.personaPrefix} {userPersona.trim()}
          </Text>
        ) : null}
        {validation || error ? (
          <Text accessibilityLiveRegion="polite" selectable style={{ color: '#FFE1EA', fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
            {validation || error}
          </Text>
        ) : null}

        <MeetingButton
          label={busy ? copy.arrangingScene : copy.enterMeeting}
          icon={<Sparkles size={17} color="#FFF9FF" />}
          onPress={submit}
          disabled={!!busy || !canCreate}
          tone="berry"
          textColor="#FFF9FF"
        />
      </ScrollView>
    </View>
  );
}
