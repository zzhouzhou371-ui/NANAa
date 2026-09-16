import { ScrollView, Text, View } from 'react-native';
import { ChevronLeft, Clock3, Plus, Trash2, Users } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/primitives';
import type { MeetingScene } from '../domain/meeting-types';
import {
  EmptyMeetingState,
  MeetingAvatar,
  MeetingHeader,
  MeetingIconButton,
  MeetingSurface,
  SectionLabel,
  meetingColors,
} from './meeting-ui-kit';
import type { MeetingCharacterOption } from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

interface MeetingListScreenProps {
  scenes: MeetingScene[];
  characters: MeetingCharacterOption[];
  compact: boolean;
  onBack?: () => void;
  onCreate: () => void;
  onOpenScene: (scene: MeetingScene) => void;
  onDeleteScene?: (scene: MeetingScene) => void;
}

function lastSceneText(scene: MeetingScene, fallback: string) {
  const turn = scene.turns.at(-1);
  const block = turn?.blocks.at(-1);
  return block?.text.trim() || scene.rollingRecap.trim() || scene.sceneSupplement.trim() || fallback;
}

function formatMeetingTime(timestamp: number, locale: string) {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
}

function SceneRow({
  scene,
  characters,
  onPress,
  onDelete,
}: {
  scene: MeetingScene;
  characters: MeetingCharacterOption[];
  onPress: () => void;
  onDelete?: () => void;
}) {
  const copy = useMeetingCopy();
  const cast = scene.castIds
    .map(id => characters.find(character => character.id === id))
    .filter((character): character is MeetingCharacterOption => !!character);
  const isActive = scene.state === 'active';
  const supportingText = isActive
    ? lastSceneText(scene, copy.storyNotStarted)
    : scene.rollingRecap.trim() || copy.completedStoryFallback;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${isActive ? copy.inProgress : copy.ended}: ${scene.title}`}
      onPress={onPress}
      scale={0.985}
        style={{ flex: 1, minWidth: 0, minHeight: 94, borderRadius: 18 }}
      >
      <MeetingSurface
        tone={isActive ? 'champagnePink' : 'lavender'}
        depth={isActive ? 'raised' : 'raisedSmall'}
        radius={18}
        contentStyle={{ minHeight: 94, padding: 13, flexDirection: 'row', gap: 12 }}
      >
        <View style={{ width: 52, height: 52 }}>
          {cast.slice(0, 3).map((character, index) => (
            <View
              key={character.id}
              style={{ position: 'absolute', left: index * 11, top: index % 2 === 0 ? 0 : 10 }}
            >
              <MeetingAvatar character={character} size={36} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: meetingColors.ink, fontSize: 15, fontWeight: '800' }}>
              {scene.title || copy.unnamedMeeting}
            </Text>
            <Text style={{ color: meetingColors.inkSoft, fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {formatMeetingTime(scene.updatedAt, copy.locale)}
            </Text>
          </View>
          <Text numberOfLines={2} style={{ color: meetingColors.inkMuted, fontSize: 13, lineHeight: 18 }}>
            {supportingText}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {isActive ? <Clock3 size={12} color={meetingColors.relationship} /> : <Users size={12} color={meetingColors.memory} />}
            <Text style={{ color: isActive ? meetingColors.relationship : meetingColors.memory, fontSize: 11, fontWeight: '800' }}>
              {isActive ? copy.activeTurns(scene.turns.length) : copy.sharedMemoriesCount(cast.length)}
            </Text>
          </View>
        </View>
      </MeetingSurface>
      </AnimatedPressable>
      {onDelete ? (
        <MeetingIconButton
          label={copy.deleteMeeting}
          onPress={onDelete}
          icon={<Trash2 size={16} color={meetingColors.danger} />}
        />
      ) : null}
    </View>
  );
}

export function MeetingListScreen({
  scenes,
  characters,
  compact,
  onBack,
  onCreate,
  onOpenScene,
  onDeleteScene,
}: MeetingListScreenProps) {
  const copy = useMeetingCopy();
  const activeScenes = scenes.filter(scene => scene.state === 'active');
  const completedScenes = scenes.filter(scene => scene.state !== 'active');

  return (
    <View style={{ flex: 1 }}>
      <MeetingHeader
        compact={compact}
        title={copy.meeting}
        subtitle={activeScenes.length ? copy.activeStories(activeScenes.length) : copy.listSubtitle}
        left={onBack ? <MeetingIconButton label={copy.back} onPress={onBack} icon={<ChevronLeft size={21} color={meetingColors.ink} />} /> : undefined}
        right={<MeetingIconButton label={copy.createMeeting} onPress={onCreate} icon={<Plus size={20} color={meetingColors.ink} />} />}
      />

      {scenes.length === 0 ? (
        <EmptyMeetingState onCreate={onCreate} />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: compact ? 12 : 16, paddingTop: 8, paddingBottom: 24, gap: 16 }}
        >
          {activeScenes.length ? (
            <View style={{ gap: 9 }}>
              <SectionLabel>{copy.ongoing}</SectionLabel>
              {activeScenes.map(scene => (
                <SceneRow key={scene.id} scene={scene} characters={characters} onPress={() => onOpenScene(scene)} onDelete={onDeleteScene ? () => onDeleteScene(scene) : undefined} />
              ))}
            </View>
          ) : null}

          {completedScenes.length ? (
            <View style={{ gap: 9 }}>
              <SectionLabel>{copy.written}</SectionLabel>
              {completedScenes.map(scene => (
                <SceneRow key={scene.id} scene={scene} characters={characters} onPress={() => onOpenScene(scene)} onDelete={onDeleteScene ? () => onDeleteScene(scene) : undefined} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
