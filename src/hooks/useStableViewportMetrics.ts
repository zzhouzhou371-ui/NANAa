import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/**
 * Android's window height shrinks while the IME is open. Responsive breakpoints
 * must use the physical screen height there, otherwise focusing an input can
 * reflow the whole simulated phone between regular and compact layouts.
 */
export function useStableViewportMetrics() {
  const window = useWindowDimensions();
  const stableHeight = Platform.OS === 'web'
    ? window.height
    : Math.max(window.height, Dimensions.get('screen').height);

  return {
    width: window.width,
    height: window.height,
    stableHeight,
    compactHeight: stableHeight < 700,
    compact: window.width <= 360 || stableHeight < 700,
  };
}
