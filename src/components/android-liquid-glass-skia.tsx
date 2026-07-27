import type { RefObject } from 'react';
import type { View } from 'react-native';

export interface LiquidGlassSkiaSpecimen {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

interface AndroidLiquidGlassSkiaOverlayProps {
  targetRef: RefObject<View | null>;
  width: number;
  height: number;
  specimens: LiquidGlassSkiaSpecimen[];
  onReadyChange: (ready: boolean) => void;
}

export function AndroidLiquidGlassSkiaOverlay(
  _props: AndroidLiquidGlassSkiaOverlayProps,
) {
  return null;
}
