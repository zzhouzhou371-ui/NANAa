import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Battery from 'expo-battery';

export function useBattery(): { level: number; charging: boolean } {
  const [level, setLevel] = useState(1);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      const lvl = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      setLevel(lvl);
      setCharging(state === Battery.BatteryState.CHARGING);
    })();

    if (typeof Battery.addBatteryLevelListener !== 'function') return;

    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setLevel(batteryLevel);
    });
    return () => sub.remove();
  }, []);

  return { level, charging };
}
