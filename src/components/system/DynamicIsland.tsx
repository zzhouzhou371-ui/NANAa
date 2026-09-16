import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MotiView } from 'moti';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { NativeGradient } from '../primitives';
import { NeumorphicSurface, neumorphicPalette } from '../neumorphic-surface';
import type { IslandNotification } from '../../types';
import { palette } from '../../constants/design';
import { useNanaStore } from '../../stores/nanaStore';
import { useStableViewportMetrics } from '../../hooks/useStableViewportMetrics';
import {
  DYNAMIC_ISLAND_COMPACT_HEIGHT,
  DYNAMIC_ISLAND_REGULAR_HEIGHT,
  getPhoneIslandTopOffset,
} from './phone-shell-layout';

const islandGlass = {
  edge: 'rgba(255, 237, 231, 0.32)',
  iconBubbleColors: ['rgba(255, 232, 222, 0.92)', 'rgba(205, 135, 153, 0.8)'] as [string, string],
};
const ISLAND_EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

const isImageIcon = (icon: unknown): icon is string => (
  typeof icon === 'string' && /^(https?:|data:|file:|content:|blob:)/.test(icon)
);

export interface DynamicIslandRecordingState {
  phase: 'starting' | 'recording' | 'cancelArmed' | 'transcribeArmed' | 'finishing' | 'converting' | 'tooShort';
  title: string;
  desc: string;
  durationSec: number;
}

let recordingSnapshot: DynamicIslandRecordingState | null = null;
const recordingListeners = new Set<() => void>();

export function setDynamicIslandRecordingState(next: DynamicIslandRecordingState | null) {
  if (
    recordingSnapshot === next
    || (
      recordingSnapshot
      && next
      && recordingSnapshot.phase === next.phase
      && recordingSnapshot.title === next.title
      && recordingSnapshot.desc === next.desc
      && recordingSnapshot.durationSec === next.durationSec
    )
    || (!recordingSnapshot && !next)
  ) {
    return;
  }
  recordingSnapshot = next;
  recordingListeners.forEach(listener => listener());
}

function subscribeToRecordingState(listener: () => void) {
  recordingListeners.add(listener);
  return () => recordingListeners.delete(listener);
}

export function useDynamicIslandRecordingState() {
  return useSyncExternalStore(
    subscribeToRecordingState,
    () => recordingSnapshot,
    () => null,
  );
}

export function useDynamicIslandExpanded() {
  const notification = useNanaStore(state => state.islandNotification);
  const callVisible = useNanaStore(state => state.callOverlay.show);
  const activeApp = useNanaStore(state => state.activeApp);
  const recordingVisible = useSyncExternalStore(
    subscribeToRecordingState,
    () => recordingSnapshot !== null,
    () => false,
  );
  return activeApp === 'meeting' ? false : callVisible || recordingVisible || !!notification;
}

interface DynamicIslandProps {
  compact?: boolean;
}

export function useReduceMotionEnabled() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

function formatElapsed(durationSec: number) {
  const safeDuration = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(safeDuration / 60);
  const seconds = safeDuration % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function IslandActivity({
  status,
  neumorphic,
  reducedMotion,
}: {
  status?: IslandNotification['status'];
  neumorphic: boolean;
  reducedMotion: boolean;
}) {
  const processing = status === 'typing' || status === 'processing' || status === 'payment';
  const result = status === 'success' || status === 'memory' || status === 'error';
  const lane = processing ? 0 : result ? 1 : 2;
  const activityColor = status === 'payment'
    ? palette.yellow
    : status === 'memory'
      ? palette.crystalBlue
      : status === 'success'
        ? palette.green
        : status === 'error'
          ? palette.coral
          : neumorphic
            ? neumorphicPalette.berry
            : palette.accentSoft;

  return (
    <View
      style={{
        width: 38,
        height: 5,
        marginTop: 6,
        overflow: 'hidden',
      }}
    >
      <MotiView
        animate={{ translateY: lane * -8 }}
        transition={{
          type: 'timing',
          duration: reducedMotion ? 0 : 170,
          easing: ISLAND_EASE_OUT,
        }}
        style={{ width: 38, height: 21 }}
      >
        <View style={{ width: 38, height: 5, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {[0, 1, 2].map(index => (
            <View
              key={index}
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: activityColor,
              }}
            />
          ))}
        </View>
        <View
          style={{
            width: 34,
            height: 4,
            marginTop: 4,
            borderRadius: 999,
            backgroundColor: activityColor,
          }}
        />
        <View style={{ width: 38, height: 5, marginTop: 4 }} />
      </MotiView>
    </View>
  );
}

function NotificationIcon({
  notification,
  neumorphic,
}: {
  notification: IslandNotification;
  neumorphic: boolean;
}) {
  const icon = isImageIcon(notification.icon) ? (
    <ExpoImage
      source={{ uri: notification.icon }}
      contentFit="cover"
      transition={0}
      style={{ width: '100%', height: '100%' }}
    />
  ) : typeof notification.icon === 'string' || !notification.icon ? (
    <Text style={{ fontSize: 17, color: palette.ink }}>{notification.icon || 'AI'}</Text>
  ) : notification.icon;

  if (neumorphic) {
    return (
      <NeumorphicSurface
        pointerEvents="none"
        depth="raisedSmall"
        tone="pinkGold"
        radius={18}
        fill={false}
        style={{ width: 36, height: 36 }}
        contentStyle={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {icon}
      </NeumorphicSurface>
    );
  }

  return (
    <NativeGradient
      direction="to-br"
      colors={islandGlass.iconBubbleColors}
      borderRadius={20}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: islandGlass.edge,
        overflow: 'hidden',
      }}
    >
      {icon}
    </NativeGradient>
  );
}

export function DynamicIsland({ compact: compactOverride }: DynamicIslandProps = {}) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const { width, compactHeight } = useStableViewportMetrics();
  const compact = compactOverride ?? compactHeight;
  const reducedMotion = useReduceMotionEnabled();
  const chromeStyle = useNanaStore(state => state.themeConfig.chromeStyle);
  const language = useNanaStore(state => state.themeConfig.language);
  const activeApp = useNanaStore(state => state.activeApp);
  const ordinaryNotification = useNanaStore(state => state.islandNotification);
  const callOverlay = useNanaStore(state => state.callOverlay);
  const recording = useDynamicIslandRecordingState();
  const [clockNow, setClockNow] = useState(() => Date.now());
  const neumorphic = chromeStyle === 'neumorphic-v1';

  useEffect(() => {
    if (!callOverlay.show || callOverlay.status !== 'connected') return undefined;
    setClockNow(Date.now());
    const timer = setInterval(() => setClockNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [callOverlay.show, callOverlay.status, callOverlay.connectedAt]);

  const callDurationSec = callOverlay.connectedAt
    ? Math.max(callOverlay.durationSec || 0, Math.floor((clockNow - callOverlay.connectedAt) / 1_000))
    : callOverlay.durationSec || 0;
  const callKindLabel = callOverlay.type === 'video' ? t.videoCall : t.voiceCall;
  const callStatusLabel = callOverlay.status === 'connected'
    ? formatElapsed(callDurationSec)
    : language === 'zh'
      ? callOverlay.status === 'incoming'
        ? '来电'
        : callOverlay.status === 'ringing'
          ? '正在呼叫'
          : callOverlay.status === 'ending'
            ? '正在结束'
            : '连接中'
      : callOverlay.status === 'incoming'
        ? 'Incoming'
        : callOverlay.status === 'ringing'
          ? 'Calling'
          : callOverlay.status === 'ending'
            ? 'Ending'
            : 'Connecting';
  const callNotification: IslandNotification | null = callOverlay.show
    ? {
        title: callOverlay.name || callKindLabel,
        desc: `${callKindLabel} · ${callStatusLabel}`,
        icon: callOverlay.avatar,
        status: 'processing',
      }
    : null;
  const recordingNotification: IslandNotification | null = recording
    ? {
        title: recording.title,
        desc: `${recording.desc} · ${formatElapsed(recording.durationSec)}`,
        icon: '●',
        status: recording.phase === 'tooShort' ? 'error' : 'processing',
      }
    : null;
  const notification = callNotification || recordingNotification || ordinaryNotification;
  const expandedWidth = Math.min(width - 34, 328);
  const collapsedWidth = neumorphic ? (compact ? 118 : 136) : (compact ? 154 : 184);
  const targetWidth = notification ? expandedWidth : collapsedWidth;
  const collapsedHeight = 44;
  const targetHeight = notification
    ? compact ? DYNAMIC_ISLAND_COMPACT_HEIGHT : DYNAMIC_ISLAND_REGULAR_HEIGHT
    : collapsedHeight;
  const titleColor = neumorphic ? neumorphicPalette.onLightPrimary : '#FFF7F0';
  const descColor = neumorphic ? neumorphicPalette.onLightSecondary : 'rgba(255, 235, 230, 0.72)';
  const islandTransition = {
    type: 'timing' as const,
    duration: reducedMotion ? 0 : notification ? 180 : 160,
    easing: ISLAND_EASE_OUT,
  };
  const notificationSemanticState = callNotification
    ? `call-copy-${callOverlay.status}-${callNotification.title}`
    : recordingNotification
      ? `recording-copy-${recording?.phase}`
      : ordinaryNotification
        ? `ordinary-copy-${ordinaryNotification.status || 'idle'}-${ordinaryNotification.title}`
        : 'idle-copy';
  const visibleNotification: IslandNotification = notification ?? {
    title: '',
    desc: '',
    icon: '',
  };
  const notificationVisible = notification !== null;
  const notificationOffsetX = useSharedValue(notificationVisible ? 0 : -expandedWidth);
  const copyOffsetY = useSharedValue(0);
  const previousSemanticStateRef = useRef(notificationSemanticState);

  useEffect(() => {
    cancelAnimation(notificationOffsetX);
    notificationOffsetX.value = reducedMotion
      ? notificationVisible ? 0 : -expandedWidth
      : withTiming(notificationVisible ? 0 : -expandedWidth, {
          duration: notificationVisible ? 180 : 160,
          easing: ISLAND_EASE_OUT,
        });
  }, [expandedWidth, notificationOffsetX, notificationVisible, reducedMotion]);

  useLayoutEffect(() => {
    if (
      notificationVisible
      && previousSemanticStateRef.current !== notificationSemanticState
    ) {
      cancelAnimation(copyOffsetY);
      copyOffsetY.value = reducedMotion ? 0 : 5;
      if (!reducedMotion) {
        copyOffsetY.value = withTiming(0, {
          duration: 170,
          easing: ISLAND_EASE_OUT,
        });
      }
    }
    previousSemanticStateRef.current = notificationSemanticState;
  }, [copyOffsetY, notificationSemanticState, notificationVisible, reducedMotion]);

  const notificationSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notificationOffsetX.value }],
  }));
  const copySlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: copyOffsetY.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + getPhoneIslandTopOffset(chromeStyle, compact),
        right: 0,
        left: 0,
        zIndex: 80,
        alignItems: 'center',
        display: activeApp === 'meeting' ? 'none' : 'flex',
      }}
    >
      <MotiView
        testID="home-dynamic-island"
        pointerEvents="none"
        accessible
        accessibilityLabel={notification ? `${notification.title}, ${notification.desc}` : undefined}
        accessibilityLiveRegion={notification ? 'polite' : 'none'}
        animate={{
          width: targetWidth,
          height: targetHeight,
        }}
        transition={islandTransition}
        style={{
          width: collapsedWidth,
          height: collapsedHeight,
          borderRadius: 999,
          backgroundColor: 'transparent',
          overflow: 'visible',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
      {neumorphic ? (
        <>
          <NeumorphicSurface
            pointerEvents="none"
            depth="flat"
            tone="lavender"
            radius={999}
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: '#C9C0DA',
              },
            ]}
            contentStyle={{
              overflow: 'visible',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 3,
              left: 13,
              right: 16,
              height: 1,
              borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.34)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 14,
              bottom: 2,
              left: 16,
              height: 1,
              borderRadius: 1,
              backgroundColor: 'rgba(52,39,69,0.20)',
            }}
          />
        </>
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: 999, overflow: 'hidden' }]}
        >
          <ExpoImage
            source={require('../../../assets/generated/nana-2_5d/nana-dynamic-island-v2-smooth.png')}
            contentFit="fill"
            transition={0}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { borderRadius: 999, overflow: 'hidden' }]}
      >
        <Animated.View
          style={[
            notificationSlideStyle,
            {
              position: 'absolute',
              top: compact ? 8 : 11,
              left: 0,
              zIndex: 2,
              width: expandedWidth,
              height: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              paddingLeft: 20,
              paddingRight: neumorphic ? 62 : 22,
            },
          ]}
        >
          <NotificationIcon notification={visibleNotification} neumorphic={neumorphic} />
          <View style={{ flex: 1, minWidth: 0, height: 44, justifyContent: 'center' }}>
            <View style={{ height: 31, position: 'relative', overflow: 'hidden' }}>
              <Animated.View style={[StyleSheet.absoluteFillObject, copySlideStyle]}>
                <Text numberOfLines={1} style={{ color: titleColor, fontSize: 14, lineHeight: 16, fontWeight: '800' }}>
                  {visibleNotification.title}
                </Text>
                <Text numberOfLines={1} style={{ color: descColor, fontSize: 12.5, lineHeight: 15, marginTop: 0 }}>
                  {visibleNotification.desc}
                </Text>
              </Animated.View>
            </View>
            <View style={{ height: 11, justifyContent: 'flex-end' }}>
              <IslandActivity
                status={visibleNotification.status}
                neumorphic={neumorphic}
                reducedMotion={reducedMotion}
              />
            </View>
          </View>
        </Animated.View>

        {neumorphic ? (
          <MotiView
            animate={{ translateX: notificationVisible ? -82 : 0 }}
            transition={{
              type: 'timing',
              duration: reducedMotion ? 0 : notificationVisible ? 180 : 160,
              easing: ISLAND_EASE_OUT,
            }}
            style={{
              position: 'absolute',
              left: compact ? 16 : 18,
              top: compact ? 12 : 14,
              width: compact ? 43 : 48,
              height: 16,
              zIndex: 3,
            }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="inset"
              tone="lavender"
              radius={8}
              fill={false}
              style={{ width: '100%', height: '100%' }}
              contentStyle={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 6,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: neumorphicPalette.berry,
                  boxShadow: '0 1px 3px rgba(52,31,48,0.30)',
                }}
              />
              <View
                style={{
                  width: compact ? 22 : 27,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: 'rgba(77,63,89,0.40)',
                }}
              />
            </NeumorphicSurface>
          </MotiView>
        ) : null}
      </View>

      {neumorphic ? (
        <MotiView
          animate={{
            translateX: notificationVisible ? -1 : 0,
            translateY: notificationVisible ? 8 : 0,
            scale: notificationVisible ? 1 : compact ? 0.96 : 1,
          }}
          transition={{
            type: 'timing',
            duration: reducedMotion ? 0 : notificationVisible ? 180 : 160,
            easing: ISLAND_EASE_OUT,
          }}
          style={{
            position: 'absolute',
            right: 4,
            top: compact ? -3 : -2,
            zIndex: 5,
            width: 49,
            height: 49,
          }}
        >
          <ExpoImage
            pointerEvents="none"
            source={require('../../../assets/generated/nana-kuromi-v1/kuromi-soft-3d.png')}
            contentFit="contain"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
            style={StyleSheet.absoluteFillObject}
          />
        </MotiView>
      ) : null}
      </MotiView>
    </View>
  );
}
