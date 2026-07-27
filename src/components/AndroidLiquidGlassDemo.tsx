import { useRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplets, Layers3 } from 'lucide-react-native';

import {
  AndroidLiquidGlassSkiaOverlay,
  type LiquidGlassSkiaSpecimen,
} from './android-liquid-glass-skia';

interface AndroidLiquidGlassDemoProps extends Omit<ViewProps, 'children'> {
  backdrop: ReactNode;
  children?: ReactNode;
}

interface LiquidGlassSpecimenProps {
  skiaReady: boolean;
  shape: 'pill' | 'circle';
  children: ReactNode;
  testID: string;
}

const IS_ANDROID = process.env.EXPO_OS === 'android';

function LiquidGlassSpecimen({
  skiaReady,
  shape,
  children,
  testID,
}: LiquidGlassSpecimenProps) {
  const circle = shape === 'circle';
  const radius = circle ? 30 : 28;

  return (
    <View
      style={[
        styles.specimenShadow,
        circle ? styles.circleSize : styles.pillSize,
        { borderRadius: radius },
      ]}
    >
      <View
        testID={testID}
        style={[
          styles.materialClip,
          circle ? styles.circleSize : styles.pillSize,
          { borderRadius: radius },
        ]}
      >
        {!skiaReady ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0.20)',
                'rgba(255,255,255,0.035)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.28, 0.62]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0)',
                'rgba(3,7,18,0.10)',
              ]}
              locations={[0, 0.58, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.refractiveEdge,
                { borderRadius: radius },
              ]}
            />
          </>
        ) : null}
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.specimenContent,
          circle ? styles.circleSize : styles.pillSize,
          { borderRadius: radius },
        ]}
      >
        <View style={[styles.contentLayout, circle ? styles.circleContent : styles.pillContent]}>
          {children}
        </View>
      </View>
    </View>
  );
}

/**
 * Isolated Android material lab. It owns a dedicated BlurTargetView and does
 * not depend on ThickGlassSurface, so the production material remains intact
 * while the optical recipe is evaluated on the real home-screen backdrop.
 */
export function AndroidLiquidGlassDemo({
  backdrop,
  children,
  style,
  ...viewProps
}: AndroidLiquidGlassDemoProps) {
  const snapshotTarget = useRef<View | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [skiaReady, setSkiaReady] = useState(false);

  if (!IS_ANDROID) {
    return (
      <View {...viewProps} style={[styles.stage, style]}>
        {backdrop}
        {children}
      </View>
    );
  }

  return (
    <View
      {...viewProps}
      style={[styles.stage, style]}
      onLayout={(event) => {
        viewProps.onLayout?.(event);
        const { width, height } = event.nativeEvent.layout;
        setStageSize((current) => (
          current.width === width && current.height === height
            ? current
            : { width, height }
        ));
      }}
    >
      <View
        ref={snapshotTarget}
        collapsable={false}
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      >
        {backdrop}
      </View>

      {children}

      <AndroidLiquidGlassSkiaOverlay
        targetRef={snapshotTarget}
        width={stageSize.width}
        height={stageSize.height}
        specimens={getSkiaSpecimens(stageSize.width, stageSize.height)}
        onReadyChange={setSkiaReady}
      />

      <View pointerEvents="box-none" style={styles.demoOverlay}>
        <View style={styles.specimenGroup}>
          <View style={styles.circlePosition}>
            <LiquidGlassSpecimen
              skiaReady={skiaReady}
              shape="circle"
              testID="android-liquid-glass-circle"
            >
              <Droplets color="#FFFFFF" size={25} strokeWidth={2.1} />
            </LiquidGlassSpecimen>
          </View>

          <View style={styles.pillPosition}>
            <LiquidGlassSpecimen
              skiaReady={skiaReady}
              shape="pill"
              testID="android-liquid-glass-pill"
            >
              <Layers3 color="#FFFFFF" size={22} strokeWidth={2.1} />
              <Text style={styles.label}>Liquid Glass</Text>
            </LiquidGlassSpecimen>
          </View>
        </View>
      </View>
    </View>
  );
}

function getSkiaSpecimens(width: number, height: number): LiquidGlassSkiaSpecimen[] {
  const groupLeft = (width - 238) / 2;
  const groupTop = height * 0.5;

  return [
    {
      key: 'pill',
      x: groupLeft + 72,
      y: groupTop,
      width: 166,
      height: 56,
      radius: 28,
    },
    {
      key: 'circle',
      x: groupLeft + 10,
      y: groupTop + 47,
      width: 58,
      height: 58,
      radius: 30,
    },
  ];
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    position: 'relative',
  },
  demoOverlay: {
    position: 'absolute',
    top: '50%',
    right: 0,
    left: 0,
    zIndex: 18,
    alignItems: 'center',
  },
  specimenGroup: {
    position: 'relative',
    width: 238,
    height: 112,
  },
  pillPosition: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  circlePosition: {
    position: 'absolute',
    top: 47,
    left: 10,
    zIndex: 2,
  },
  pillSize: {
    width: 166,
    height: 56,
  },
  circleSize: {
    width: 58,
    height: 58,
  },
  specimenShadow: {
    position: 'relative',
    boxShadow:
      '0 5px 10px rgba(2,6,18,0.13), 0 0 2px rgba(255,255,255,0.12)',
  },
  materialClip: {
    position: 'relative',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  refractiveEdge: {
    borderWidth: 0.75,
    borderColor: 'rgba(255,255,255,0.34)',
    boxShadow:
      'inset 0 1px 1px rgba(255,255,255,0.62), inset 1px 0 2px rgba(255,255,255,0.28), inset 0 -1px 2px rgba(255,255,255,0.22), inset -1px 0 1px rgba(255,255,255,0.14)',
  },
  specimenContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  contentLayout: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContent: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 21,
  },
  circleContent: {
    padding: 12,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
});
