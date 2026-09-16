import { View, Text } from 'react-native';
import { Signal, Wifi, BatteryFull } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTime } from '../../hooks/useTime';
import { useDynamicIslandExpanded, useReduceMotionEnabled } from './DynamicIsland';
import { PHONE_STATUS_BAR_HEIGHT } from './phone-shell-layout';

const STATUS_INK = 'rgba(246, 234, 230, 0.78)';

export function PhoneStatusBar() {
  const time = useTime();
  const insets = useSafeAreaInsets();
  const islandExpanded = useDynamicIslandExpanded();
  const reducedMotion = useReduceMotionEnabled();
  const revealDelay = reducedMotion || islandExpanded ? 0 : 60;

  return (
    <MotiView
      animate={{
        translateY: islandExpanded ? -(insets.top + 38) : 0,
      }}
      transition={{
        type: 'timing',
        duration: reducedMotion ? 0 : 160,
        delay: revealDelay,
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        paddingTop: insets.top,
        paddingHorizontal: 30,
        height: insets.top + PHONE_STATUS_BAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}
    >
      <Text style={{ color: STATUS_INK, fontSize: 15, fontWeight: '700', textShadowColor: 'rgba(5, 9, 22, 0.72)', textShadowRadius: 4 }}>{time}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Signal size={15} strokeWidth={2.2} color={STATUS_INK} />
        <Wifi size={15} strokeWidth={2.2} color={STATUS_INK} />
        <BatteryFull size={18} strokeWidth={2.2} color={STATUS_INK} />
      </View>
    </MotiView>
  );
}
