import { useState, useEffect, useRef } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

export function useKeyboardHeight(): number {
  const [rawKeyboardHeight, setRawKeyboardHeight] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const windowHeightWithoutKeyboardRef = useRef(windowHeight);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setRawKeyboardHeight(0);
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setRawKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setRawKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (rawKeyboardHeight === 0) {
    windowHeightWithoutKeyboardRef.current = windowHeight;
    return 0;
  }

  if (Platform.OS !== 'android') return rawKeyboardHeight;

  // Some Android builds fully honor adjustResize, others remain edge-to-edge,
  // and embedded emulator windows can resize only partially. Compensate only
  // for the part of the IME that the window itself did not already remove.
  const resizedBySystem = Math.max(0, windowHeightWithoutKeyboardRef.current - windowHeight);
  const uncoveredHeight = Math.max(0, rawKeyboardHeight - resizedBySystem);
  // Keep a small breathing gap between edge-to-edge Android content and IME.
  return uncoveredHeight + 6;
}
