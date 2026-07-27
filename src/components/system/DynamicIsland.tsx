import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { AnimatePresence, MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { NativeGradient } from '../primitives';
import { NeumorphicSurface, neumorphicPalette } from '../neumorphic-surface';
import type { IslandNotification } from '../../types';
import { palette } from '../../constants/design';
import { useNanaStore } from '../../stores/nanaStore';

const islandGlass = {
  edge: 'rgba(255, 237, 231, 0.32)',
  iconBubbleColors: ['rgba(255, 232, 222, 0.92)', 'rgba(205, 135, 153, 0.8)'] as [string, string],
};

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
  const recordingVisible = useSyncExternalStore(
    subscribeToRecordingState,
    () => recordingSnapshot !== null,
    () => false,
  );
  return callVisible || recordingVisible || !!notification;
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
  if (status === 'typing' || status === 'processing' || status === 'payment') {
    return (
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.3, translateY: 0 }}
            animate={{ opacity: reducedMotion ? 0.72 : 1, translateY: reducedMotion ? 0 : -2 }}
            transition={reducedMotion
              ? { type: 'timing', duration: 90 }
              : { type: 'timing', duration: 520, delay: i * 130, loop: true, repeatReverse: true }}
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: status === 'payment'
                ? palette.yellow
                : neumorphic
                  ? neumorphicPalette.berry
                  : palette.accentSoft,
            }}
          />
        ))}
      </View>
    );
  }

  if (status === 'success' || status === 'memory') {
    return (
      <View
        style={{
          height: 4,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: neumorphic ? 'rgba(70,55,80,0.16)' : 'rgba(255,255,255,0.34)',
          marginTop: 7,
        }}
      >
        <MotiView
          from={{ width: reducedMotion ? '100%' : '12%' }}
          animate={{ width: '100%' }}
          transition={{ type: 'timing', duration: reducedMotion ? 90 : 900 }}
          style={{
            height: 4,
            borderRadius: 999,
            backgroundColor: status === 'memory' ? palette.crystalBlue : palette.green,
          }}
        />
      </View>
    );
  }

  if (status === 'error') {
    return <View style={{ width: 34, height: 4, borderRadius: 999, backgroundColor: palette.coral, marginTop: 7 }} />;
  }

  return null;
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
      transition={120}
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
  const { width, height } = useWindowDimensions();
  const compact = compactOverride ?? height < 700;
  const reducedMotion = useReduceMotionEnabled();
  const chromeStyle = useNanaStore(state => state.themeConfig.chromeStyle);
  const language = useNanaStore(state => state.themeConfig.language);
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
  const presentationKey = callNotification
    ? `call-${callOverlay.startedAt || callOverlay.characterId || callOverlay.type}`
    : recordingNotification
      ? `recording-${recording?.phase}`
      : ordinaryNotification
        ? `notification-${ordinaryNotification.title}-${ordinaryNotification.desc}-${ordinaryNotification.status || 'idle'}`
        : 'idle';
  const expandedWidth = Math.min(width - 34, 328);
  const collapsedWidth = neumorphic ? (compact ? 118 : 136) : (compact ? 154 : 184);
  const targetWidth = notification ? expandedWidth : collapsedWidth;
  const collapsedHeight = 44;
  const targetHeight = notification ? (compact ? 60 : 66) : collapsedHeight;
  const targetRadius = targetHeight / 2;
  const titleColor = neumorphic ? neumorphicPalette.onLightPrimary : '#FFF7F0';
  const descColor = neumorphic ? neumorphicPalette.onLightSecondary : 'rgba(255, 235, 230, 0.72)';
  const islandTransition = reducedMotion
    ? { type: 'timing' as const, duration: 120 }
    : notification
      ? { type: 'spring' as const, damping: 20, stiffness: 210, mass: 0.8 }
      : { type: 'spring' as const, damping: 24, stiffness: 250, mass: 0.78 };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + (neumorphic ? 5 : compact ? 4 : 10),
        right: 0,
        left: 0,
        zIndex: 80,
        alignItems: 'center',
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
            radius={targetRadius}
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
          style={[StyleSheet.absoluteFillObject, { borderRadius: targetRadius, overflow: 'hidden' }]}
        >
          <ExpoImage
            source={require('../../../assets/generated/nana-2_5d/nana-dynamic-island-v2-smooth.png')}
            contentFit="fill"
            transition={120}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      <AnimatePresence>
        {notification ? (
          <MotiView
            key={presentationKey}
            from={{ opacity: 0, translateX: reducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: reducedMotion ? 0 : 8 }}
            transition={{
              type: 'timing',
              duration: reducedMotion ? 100 : 180,
              delay: reducedMotion ? 0 : 60,
            }}
            exitTransition={{
              type: 'timing',
              duration: reducedMotion ? 80 : 135,
              delay: 0,
            }}
            style={{
              zIndex: 2,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              width: '100%',
              paddingLeft: 20,
              paddingRight: neumorphic ? 62 : 22,
            }}
          >
            <NotificationIcon notification={notification} neumorphic={neumorphic} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: titleColor, fontSize: 14, fontWeight: '800' }}>
                {notification.title}
              </Text>
              <Text numberOfLines={1} style={{ color: descColor, fontSize: 12.5, marginTop: 1 }}>
                {notification.desc}
              </Text>
              <IslandActivity
                status={notification.status}
                neumorphic={neumorphic}
                reducedMotion={reducedMotion}
              />
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>

      {neumorphic && !notification ? (
        <NeumorphicSurface
          pointerEvents="none"
          depth="inset"
          tone="lavender"
          radius={8}
          fill={false}
          style={{
            position: 'absolute',
            left: compact ? 16 : 18,
            top: compact ? 12 : 14,
            width: compact ? 43 : 48,
            height: 16,
            zIndex: 3,
          }}
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
      ) : null}

      {neumorphic ? (
        <ExpoImage
          pointerEvents="none"
          source={require('../../../assets/generated/nana-kuromi-v1/kuromi-soft-3d.png')}
          contentFit="contain"
          cachePolicy="memory-disk"
          priority="high"
          style={{
            position: 'absolute',
            right: notification ? 5 : 4,
            top: notification ? 5 : compact ? -3 : -2,
            zIndex: 5,
            width: notification ? 49 : compact ? 47 : 49,
            height: notification ? 49 : compact ? 47 : 49,
          }}
        />
      ) : null}
      </MotiView>
    </View>
  );
}
