import { CalendarCheck, MapPin, X } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { AnimatedPressable } from './primitives';
import { MeetingSurface, meetingColors } from '../features/meeting/ui/meeting-ui-kit';
import type { ConversationMeetingHandoff } from '../types';
import { useMeetingCopy } from '../features/meeting/ui/use-meeting-copy';

export function MeetingHandoffCard({
  handoff,
  characterName,
  onOpen,
  onDismiss,
}: {
  handoff: ConversationMeetingHandoff;
  characterName: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const copy = useMeetingCopy();
  const started = handoff.state === 'started';
  return (
    <View testID="meeting-handoff-card" style={{ paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
      <MeetingSurface
        tone="searchBlush"
        depth="raisedSmall"
        radius={16}
        contentStyle={{ paddingHorizontal: 14, paddingVertical: 13, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#E7C8D3', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={17} color={meetingColors.relationship} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: meetingColors.ink, fontSize: 15, lineHeight: 20, fontWeight: '800' }}>
              {started ? copy.startedHandoffTitle(characterName) : copy.waitingHandoffTitle(characterName)}
            </Text>
            <Text numberOfLines={3} style={{ color: meetingColors.inkMuted, fontSize: 12, lineHeight: 18 }}>
              {handoff.title ? `${handoff.title} · ` : ''}{handoff.premise}
            </Text>
          </View>
          {!started ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={copy.closeHandoffCard}
              onPress={onDismiss}
              scale={0.94}
              style={{ width: 44, height: 44, marginTop: -7, marginRight: -9, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={17} color={meetingColors.inkMuted} />
            </AnimatedPressable>
          ) : null}
        </View>
        <AnimatedPressable
          testID="meeting-handoff-open-button"
          accessibilityRole="button"
          accessibilityLabel={started ? copy.openThisMeeting : copy.confirmRsvp}
          onPress={onOpen}
          scale={0.975}
          style={{ minHeight: 44, borderRadius: 14, overflow: 'hidden' }}
        >
          <View style={{ minHeight: 44, paddingHorizontal: 14, backgroundColor: '#8F4D66', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <CalendarCheck size={17} color="#FFF9FF" />
            <Text style={{ color: '#FFF9FF', fontSize: 13, fontWeight: '800' }}>
              {started ? copy.returnToMeeting : copy.goToMeeting}
            </Text>
          </View>
        </AnimatedPressable>
      </MeetingSurface>
    </View>
  );
}
