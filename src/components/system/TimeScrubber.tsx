import { useState } from 'react';
import { GestureResponderEvent, Pressable, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';

interface TimeScrubberProps {
  value: number | null;
  onChange: (hour: number | null) => void;
}

const TRACK_WIDTH = 244;

function formatHour(hour: number) {
  const totalMinutes = Math.round(hour * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function TimeScrubber({ value, onChange }: TimeScrubberProps) {
  const { t } = useApp();
  const [dragging, setDragging] = useState(false);
  const now = new Date();
  const displayHour = value ?? now.getHours() + now.getMinutes() / 60;

  const updateFromEvent = (event: GestureResponderEvent) => {
    const x = Math.max(0, Math.min(TRACK_WIDTH, event.nativeEvent.locationX));
    onChange(Math.round((x / TRACK_WIDTH) * 24 * 4) / 4 % 24);
  };

  return (
    <View
      accessibilityLabel={t.skyTimePreview}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 112,
        width: 286,
        marginLeft: -143,
        zIndex: 120,
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(16, 23, 48, 0.86)',
        shadowColor: '#080B18',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <Text style={{ color: '#F6D7CE', fontSize: 12, fontWeight: '800' }}>
          {value === null ? t.realTime : formatHour(value)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.returnToRealTime}
          onPress={() => onChange(null)}
          style={{ minWidth: 54, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: value === null ? 'rgba(241,169,151,0.2)' : 'rgba(255,255,255,0.08)' }}
        >
          <Text style={{ color: value === null ? '#FFC7B8' : 'rgba(255,235,230,0.7)', fontSize: 11, fontWeight: '700' }}>{t.now}</Text>
        </Pressable>
      </View>

      <View
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 24, now: Math.round(displayHour), text: formatHour(displayHour) }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => { setDragging(true); updateFromEvent(event); }}
        onResponderMove={updateFromEvent}
        onResponderRelease={() => setDragging(false)}
        onResponderTerminate={() => setDragging(false)}
        style={{ width: TRACK_WIDTH, height: 30, alignSelf: 'center', justifyContent: 'center' }}
      >
        <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row' }}>
          <View style={{ flex: 5.75, backgroundColor: '#141C39' }} />
          <View style={{ flex: 6.75, backgroundColor: '#C4A9C4' }} />
          <View style={{ flex: 5.75, backgroundColor: '#9EB9D3' }} />
          <View style={{ flex: 5, backgroundColor: '#E79B86' }} />
          <View style={{ flex: 0.75, backgroundColor: '#141C39' }} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(TRACK_WIDTH - 18, (displayHour / 24) * TRACK_WIDTH - 9)),
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#FFD0C2',
            borderWidth: 2,
            borderColor: '#FFF1EA',
            transform: [{ scale: dragging ? 1.18 : 1 }],
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 7 }}>
        {['00', '06', '12', '18', '24'].map(label => <Text key={label} style={{ color: 'rgba(255,235,230,0.54)', fontSize: 9 }}>{label}</Text>)}
      </View>
    </View>
  );
}
