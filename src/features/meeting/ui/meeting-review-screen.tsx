import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ChevronLeft, Pencil, Save } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/primitives';
import type { MeetingMemoryDraft, MeetingScene } from '../domain/meeting-types';
import {
  MeetingAvatar,
  MeetingButton,
  MeetingHeader,
  MeetingIconButton,
  MeetingSurface,
  meetingColors,
} from './meeting-ui-kit';
import type {
  MeetingCharacterOption,
  MeetingMemoryReviewInput,
  MeetingModelAdapter,
} from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

interface MeetingReviewScreenProps {
  scene: MeetingScene;
  drafts: MeetingMemoryDraft[];
  characters: MeetingCharacterOption[];
  compact: boolean;
  busy?: boolean;
  error?: string | null;
  modelAdapter?: MeetingModelAdapter;
  onBack: () => void;
  onConfirmed: () => void;
}

interface CharacterReviewState extends MeetingMemoryReviewInput {
  committed: boolean;
}

export function MeetingReviewScreen({
  scene,
  drafts,
  characters,
  compact,
  busy,
  error,
  modelAdapter,
  onBack,
  onConfirmed,
}: MeetingReviewScreenProps) {
  const copy = useMeetingCopy();
  const initialReviews = useMemo<CharacterReviewState[]>(() => scene.castIds.map(characterId => {
    const draft = drafts.find(item => item.characterId === characterId);
    return {
      draftId: draft?.id,
      characterId,
      summary: draft?.summary || scene.rollingRecap || copy.noReviewSummary,
      checked: draft?.state !== 'discarded',
      committed: draft?.state === 'committed',
    };
  }), [copy.noReviewSummary, drafts, scene.castIds, scene.rollingRecap]);
  const [reviews, setReviews] = useState(initialReviews);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);

  const updateReview = (characterId: string, patch: Partial<CharacterReviewState>) => {
    setReviews(current => current.map(review => (
      review.characterId === characterId ? { ...review, ...patch } : review
    )));
  };

  const confirm = async () => {
    if (!modelAdapter?.confirmMemoryReviews) return;
    await modelAdapter.confirmMemoryReviews(
      scene.id,
      reviews.map(({ committed: _committed, ...review }) => review),
    );
    onConfirmed();
  };

  return (
    <View style={{ flex: 1 }}>
      <MeetingHeader
        compact={compact}
        title={copy.sharedMemoryTitle}
        subtitle={copy.sharedMemorySubtitle}
        left={<MeetingIconButton label={copy.backToScene} onPress={onBack} icon={<ChevronLeft size={21} color={meetingColors.ink} />} />}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: compact ? 12 : 16, paddingTop: 8, paddingBottom: 28, gap: 12 }}
      >
        <MeetingSurface tone="champagnePink" radius={18} contentStyle={{ padding: 13, gap: 6 }}>
          <Text style={{ color: meetingColors.ink, fontSize: 15, fontWeight: '800' }}>{scene.title}</Text>
          <Text selectable style={{ color: meetingColors.inkMuted, fontSize: 13, lineHeight: 19 }}>
            {scene.rollingRecap || scene.premise}
          </Text>
        </MeetingSurface>

        {reviews.map(review => {
          const character = characters.find(item => item.id === review.characterId);
          const editing = editingCharacterId === review.characterId;
          return (
            <MeetingSurface
              key={review.characterId}
              tone={review.checked ? 'lavender' : 'soft'}
              depth={review.checked ? 'raisedSmall' : 'flat'}
              radius={18}
              contentStyle={{ padding: 13, gap: 10, opacity: review.checked ? 1 : 0.66 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <AnimatedPressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={copy.includeSummary(character?.name ?? copy.role)}
                  accessibilityState={{ checked: review.checked, disabled: review.committed }}
                  disabled={review.committed}
                  onPress={() => updateReview(review.characterId, { checked: !review.checked })}
                  style={{ width: 44, height: 44, borderRadius: 14 }}
                >
                  <MeetingSurface
                    tone={review.checked ? 'pinkGold' : 'soft'}
                    radius={14}
                    contentStyle={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {review.checked ? <Check size={18} color={meetingColors.relationship} /> : null}
                  </MeetingSurface>
                </AnimatedPressable>
                <MeetingAvatar character={character} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: meetingColors.ink, fontSize: 14, fontWeight: '800' }}>
                    {copy.memoryWith(character?.name ?? copy.role)}
                  </Text>
                  <Text style={{ color: review.committed ? meetingColors.success : meetingColors.inkSoft, fontSize: 11, fontWeight: '700' }}>
                    {review.committed ? copy.alreadyConfirmed : review.checked ? copy.willWrite : copy.willNotWrite}
                  </Text>
                </View>
                {!review.committed ? (
                  <MeetingIconButton
                    label={editing ? copy.saveSummary : copy.editSummary}
                    selected={editing}
                    onPress={() => setEditingCharacterId(editing ? null : review.characterId)}
                    icon={editing ? <Save size={16} color={meetingColors.relationship} /> : <Pencil size={16} color={meetingColors.inkMuted} />}
                  />
                ) : null}
              </View>

              {editing ? (
                <MeetingSurface tone="composer" depth="inset" radius={14}>
                  <TextInput
                    value={review.summary}
                    onChangeText={summary => updateReview(review.characterId, { summary })}
                    multiline
                    autoFocus
                    maxLength={2400}
                    accessibilityLabel={copy.editMemory(character?.name ?? copy.role)}
                    style={{ minHeight: 104, padding: 12, color: meetingColors.ink, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' }}
                  />
                </MeetingSurface>
              ) : (
                <Text selectable style={{ color: meetingColors.inkMuted, fontSize: 14, lineHeight: 21 }}>
                  {review.summary}
                </Text>
              )}
            </MeetingSurface>
          );
        })}

        {error ? (
          <Text accessibilityLiveRegion="polite" selectable style={{ color: '#FFE1EA', fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
            {error}
          </Text>
        ) : null}

        {reviews.some(review => !review.committed) ? (
          <MeetingButton
            label={busy ? copy.writingMemory : copy.confirmSelected}
            icon={<Check size={17} color="#FFF9FF" />}
            onPress={() => void confirm()}
            disabled={!!busy || reviews.some(review => review.checked && !review.summary.trim()) || !modelAdapter?.confirmMemoryReviews}
            tone="berry"
            textColor="#FFF9FF"
          />
        ) : (
          <MeetingButton label={copy.finishReview} onPress={onConfirmed} tone="pinkGold" />
        )}
      </ScrollView>
    </View>
  );
}
