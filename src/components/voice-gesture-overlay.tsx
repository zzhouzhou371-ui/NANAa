import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FileText, Send, Trash2 } from 'lucide-react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { create } from 'zustand';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import {
  NeumorphicSurface,
  neumorphicPalette,
  type NeumorphicDepth,
  type NeumorphicTone,
} from './neumorphic-surface';
import { useReduceMotionEnabled } from './system/DynamicIsland';

export type VoiceGestureVisualPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'cancelArmed'
  | 'transcribeArmed'
  | 'finishing'
  | 'converting'
  | 'tooShort'
  | 'permissionBlocked'
  | 'failed';

interface VoiceGestureVisualSnapshot {
  visible: boolean;
  phase: VoiceGestureVisualPhase;
  durationSec: number;
  meteringLevel: number;
}

interface VoiceGestureVisualState extends VoiceGestureVisualSnapshot {
  meteringHistory: number[];
  gesturePosition: number;
}

type VoiceAction = 'cancel' | 'send' | 'convert';

const initialVisualState: VoiceGestureVisualState = {
  visible: false,
  phase: 'idle',
  durationSec: 0,
  meteringLevel: 1,
  meteringHistory: [],
  gesturePosition: 1,
};

const useVoiceGestureVisualStore = create<VoiceGestureVisualState>(() => initialVisualState);
const nativeUiFont = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });
const MOTION_EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const WAVE_SAMPLE_COUNT = 18;
const VOICE_TRACK_FOLLOW_MS = 40;

export function updateVoiceGestureVisual(next: VoiceGestureVisualSnapshot) {
  useVoiceGestureVisualStore.setState(current => {
    const rawSample = Math.max(0.12, Math.min(1, next.meteringLevel));
    const previousSample = current.meteringHistory.at(-1) ?? rawSample;
    // Recorder metering can move tens of decibels between callbacks. A short
    // low-pass filter keeps the waveform responsive without making every bar
    // snap to the newest sample.
    const smoothedSample = previousSample * 0.52 + rawSample * 0.48;
    const previousHistory = current.visible ? current.meteringHistory : [];
    const meteringHistory = [...previousHistory, smoothedSample].slice(-WAVE_SAMPLE_COUNT);
    return {
      ...next,
      meteringHistory,
      gesturePosition: current.gesturePosition,
    };
  });
}

export function updateVoiceGesturePosition(position: number) {
  const gesturePosition = Math.max(0, Math.min(2, position));
  useVoiceGestureVisualStore.setState(current => (
    Math.abs(current.gesturePosition - gesturePosition) < 0.001
      ? current
      : { ...current, gesturePosition }
  ));
}

export function hideVoiceGestureVisual() {
  useVoiceGestureVisualStore.setState(current => (
    current.visible ? initialVisualState : current
  ));
}

function formatElapsed(durationSec: number) {
  const safeDuration = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(safeDuration / 60);
  const seconds = safeDuration % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolveWaveScale(sample: number, phase: VoiceGestureVisualPhase, index: number) {
  if (phase === 'cancelArmed') {
    return 0.12 + sample * 0.2;
  }
  if (phase === 'transcribeArmed' || phase === 'converting') {
    const centerEmphasis = 1 - Math.min(1, Math.abs(index - (WAVE_SAMPLE_COUNT - 1) / 2) / 9);
    return Math.min(0.78, 0.2 + sample * 0.38 + centerEmphasis * 0.1);
  }
  return Math.max(0.15, sample);
}

function VoiceMaterialSurface({
  children,
  neumorphic,
  depth = 'raised',
  tone = 'lavender',
  radius,
  style,
  contentStyle,
  testID,
}: {
  children?: ReactNode;
  neumorphic: boolean;
  depth?: NeumorphicDepth;
  tone?: NeumorphicTone;
  radius: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  if (neumorphic) {
    return (
      <NeumorphicSurface
        testID={testID}
        pointerEvents="none"
        depth={depth}
        tone={tone}
        radius={radius}
        style={style}
        contentStyle={contentStyle}
      >
        {children}
      </NeumorphicSurface>
    );
  }

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[
        {
          position: 'relative',
          borderRadius: radius,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: 'rgba(48, 28, 43, 0.94)',
          boxShadow: depth === 'inset'
            ? 'inset 3px 3px 7px rgba(5,2,8,0.50), inset -2px -2px 5px rgba(255,238,247,0.10)'
            : '0 6px 12px rgba(5,2,8,0.32)',
        },
        style,
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.015)', 'rgba(5,2,8,0.18)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
      />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

function VoiceWaveform({
  samples,
  phase,
  reducedMotion,
  color,
}: {
  samples: number[];
  phase: VoiceGestureVisualPhase;
  reducedMotion: boolean;
  color: string;
}) {
  const paddedSamples = [
    ...Array(Math.max(0, WAVE_SAMPLE_COUNT - samples.length)).fill(0.12),
    ...samples,
  ].slice(-WAVE_SAMPLE_COUNT);

  return (
    <View
      testID="voice-gesture-live-waveform"
      style={{
        height: 28,
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {paddedSamples.map((sample, index) => {
        const scaleY = resolveWaveScale(sample, phase, index);
        const recency = 0.48 + ((index + 1) / WAVE_SAMPLE_COUNT) * 0.52;
        return (
          <MotiView
            key={index}
            animate={{
              scaleY,
            }}
            transition={{
              type: 'timing',
              duration: reducedMotion ? 0 : phase === 'recording' ? 165 : 190,
              easing: MOTION_EASE_OUT,
            }}
            style={{
              width: 2.5,
              height: 25,
              borderRadius: 2,
              backgroundColor: color,
              opacity: recency,
            }}
          />
        );
      })}
    </View>
  );
}

function ActionGlyph({
  action,
  active,
  meteringLevel,
  reducedMotion,
  color,
}: {
  action: VoiceAction;
  active: boolean;
  meteringLevel: number;
  reducedMotion: boolean;
  color: string;
}) {
  if (action === 'cancel') {
    return <Trash2 size={16} color={color} strokeWidth={active ? 2.2 : 1.8} />;
  }
  if (action === 'convert') {
    return <FileText size={16} color={color} strokeWidth={active ? 2.2 : 1.8} />;
  }

  return active ? (
    <View style={{ width: 18, height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      {[0.52, 1, 0.72].map((weight, index) => (
        <MotiView
          key={index}
          animate={{ scaleY: Math.max(0.32, meteringLevel * weight) }}
          transition={{
            type: 'timing',
            duration: reducedMotion ? 0 : 165,
            easing: MOTION_EASE_OUT,
          }}
          style={{
            width: 2.5,
            height: 12,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  ) : (
    <Send size={16} color={color} strokeWidth={1.8} />
  );
}

export function VoiceGestureOverlay() {
  const { t } = useApp();
  const window = useWindowDimensions();
  const framedOnWeb = Platform.OS === 'web' && window.width >= 560;
  const width = framedOnWeb ? Math.min(430, window.width - 48) : window.width;
  const height = framedOnWeb ? Math.min(window.height, 932) : window.height;
  const visual = useVoiceGestureVisualStore();
  const activeApp = useNanaStore(state => state.activeApp);
  const weChatPage = useNanaStore(state => state.weChatPage);
  const callVisible = useNanaStore(state => state.callOverlay.show);
  const neumorphic = useNanaStore(state => state.themeConfig.chromeStyle === 'neumorphic-v1');
  const reducedMotion = useReduceMotionEnabled();

  if (!visual.visible || activeApp !== 'wechat' || weChatPage !== 'chat' || callVisible) return null;

  const cancelArmed = visual.phase === 'cancelArmed';
  const transcribeArmed = visual.phase === 'transcribeArmed' || visual.phase === 'converting';
  const terminalFeedback = visual.phase === 'tooShort' || visual.phase === 'converting';
  const activeAction: VoiceAction = cancelArmed ? 'cancel' : transcribeArmed ? 'convert' : 'send';
  const controlWidth = Math.min(width - 28, 402);
  const trackInset = 8;
  const trackWidth = controlWidth - trackInset * 2;
  const segmentWidth = trackWidth / 3;
  const controlHeight = 88;
  const controlBottom = Math.max(14, Math.min(24, height * 0.024));
  const liveWidth = Math.min(width - 44, 246);
  const liveTop = Math.max(164, height * 0.57 - 42);
  const remainingSeconds = visual.durationSec >= 50 ? Math.max(0, 60 - visual.durationSec) : null;
  const timerLabel = remainingSeconds === null
    ? formatElapsed(visual.durationSec)
    : `-${remainingSeconds}s`;
  const statusLabel = visual.phase === 'converting'
    ? t.processing
    : visual.phase === 'tooShort'
      ? t.recordingTooShort
      : cancelArmed
        ? t.releaseToCancel
        : transcribeArmed
          ? t.releaseToConvert
          : t.releaseToSend;
  const liveTone: NeumorphicTone = 'lavender';
  const liveInk = cancelArmed
    ? '#4A2635'
    : transcribeArmed
      ? '#303A57'
      : neumorphicPalette.onLightPrimary;
  const waveInk = cancelArmed
    ? '#7C3D55'
    : transcribeArmed
      ? '#4E5D87'
      : '#5B4662';
  const actionItems: { action: VoiceAction; label: string }[] = [
    { action: 'cancel', label: t.cancel },
    { action: 'send', label: t.send },
    { action: 'convert', label: t.convertToText },
  ];

  return (
    <View
      testID="voice-gesture-overlay"
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 55,
        overflow: 'hidden',
        backgroundColor: neumorphic ? 'rgba(19, 12, 24, 0.57)' : 'rgba(2, 1, 6, 0.68)',
      }}
    >
      <LinearGradient
        colors={neumorphic
          ? ['rgba(49, 35, 57, 0)', 'rgba(31, 21, 38, 0.34)', 'rgba(18, 11, 23, 0.78)']
          : ['rgba(18, 4, 17, 0)', 'rgba(9, 1, 11, 0.38)', 'rgba(4, 0, 7, 0.84)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { top: height * 0.38 }]}
      />

      <MotiView
        testID="voice-gesture-bubble"
        from={{ translateY: reducedMotion ? 0 : 5 }}
        animate={{ translateY: 0 }}
        transition={{
          type: 'timing',
          duration: reducedMotion ? 0 : 180,
          easing: MOTION_EASE_OUT,
        }}
        style={{
          position: 'absolute',
          top: liveTop,
          left: (width - liveWidth) / 2,
          width: liveWidth,
          height: 76,
        }}
      >
        <VoiceMaterialSurface
          neumorphic={neumorphic}
          depth="raisedSmall"
          tone={liveTone}
          radius={20}
          style={{ width: '100%', height: '100%' }}
          contentStyle={{ paddingHorizontal: 16, paddingVertical: 11 }}
        >
          <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                minWidth: 0,
                color: liveInk,
                fontSize: 12.5,
                lineHeight: 17,
                fontWeight: '700',
                fontFamily: nativeUiFont,
              }}
            >
              {statusLabel}
            </Text>
            <Text
              style={{
                color: liveInk,
                fontSize: 11.5,
                lineHeight: 16,
                fontWeight: '700',
                fontFamily: nativeUiFont,
                fontVariant: ['tabular-nums'],
                opacity: 0.72,
              }}
            >
              {timerLabel}
            </Text>
          </View>
          {terminalFeedback ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View
                style={{
                  width: visual.phase === 'converting' ? '72%' : '42%',
                  height: 4,
                  borderRadius: 2,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(61, 52, 75, 0.16)',
                }}
              >
                <MotiView
                  from={{ translateX: reducedMotion || visual.phase !== 'converting' ? 0 : -16 }}
                  animate={{ translateX: reducedMotion || visual.phase !== 'converting' ? 0 : 16 }}
                  transition={{
                    type: 'timing',
                    duration: reducedMotion ? 0 : 220,
                    loop: !reducedMotion && visual.phase === 'converting',
                    repeatReverse: true,
                    easing: MOTION_EASE_OUT,
                  }}
                  style={{
                    width: '72%',
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: waveInk,
                  }}
                />
              </View>
            </View>
          ) : (
            <VoiceWaveform
              samples={visual.meteringHistory}
              phase={visual.phase}
              reducedMotion={reducedMotion}
              color={waveInk}
            />
          )}
        </VoiceMaterialSurface>
      </MotiView>

      {!terminalFeedback ? (
        <MotiView
          from={{ translateY: reducedMotion ? 0 : 7 }}
          animate={{ translateY: 0 }}
          transition={{
            type: 'timing',
            duration: reducedMotion ? 0 : 190,
            easing: MOTION_EASE_OUT,
          }}
          style={{
            position: 'absolute',
            right: (width - controlWidth) / 2,
            bottom: controlBottom,
            left: (width - controlWidth) / 2,
            width: controlWidth,
            height: controlHeight,
          }}
        >
          <VoiceMaterialSurface
            testID="voice-gesture-control-track"
            neumorphic={neumorphic}
            depth="raised"
            tone="lavender"
            radius={24}
            style={{ width: '100%', height: '100%' }}
            contentStyle={{ padding: trackInset }}
          >
            <VoiceMaterialSurface
              neumorphic={neumorphic}
              depth="inset"
              tone="lavender"
              radius={18}
              style={{ width: trackWidth, height: controlHeight - trackInset * 2 }}
              contentStyle={{ position: 'relative', overflow: 'hidden' }}
            >
              <MotiView
                testID="voice-gesture-active-segment"
                animate={{
                  translateX: visual.gesturePosition * segmentWidth,
                }}
                transition={{
                  type: 'timing',
                  duration: reducedMotion ? 0 : VOICE_TRACK_FOLLOW_MS,
                  easing: MOTION_EASE_OUT,
                }}
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 0,
                  width: segmentWidth,
                  bottom: 4,
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  backgroundColor: activeAction === 'cancel'
                    ? 'rgba(163, 88, 113, 0.28)'
                    : activeAction === 'convert'
                      ? 'rgba(99, 116, 164, 0.24)'
                      : 'rgba(255, 249, 255, 0.19)',
                  boxShadow: neumorphic
                    ? 'inset 3px 3px 7px rgba(48,35,61,0.25), inset -3px -3px 7px rgba(255,252,255,0.28)'
                    : 'inset 3px 3px 7px rgba(4,2,8,0.42), inset -2px -2px 5px rgba(255,240,248,0.10)',
                }}
              />

              <View style={{ flex: 1, flexDirection: 'row' }}>
                {actionItems.map(item => {
                  const active = item.action === activeAction;
                  const color = active
                    ? item.action === 'cancel'
                      ? '#512536'
                      : item.action === 'convert'
                        ? '#2F3958'
                        : neumorphicPalette.onLightPrimary
                    : neumorphic
                      ? 'rgba(48,37,55,0.62)'
                      : 'rgba(255,241,248,0.62)';
                  return (
                    <View
                      key={item.action}
                      style={{
                        width: segmentWidth,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        paddingHorizontal: 5,
                      }}
                    >
                      <ActionGlyph
                        action={item.action}
                        active={active}
                        meteringLevel={visual.meteringHistory.at(-1) ?? visual.meteringLevel}
                        reducedMotion={reducedMotion}
                        color={color}
                      />
                      <Text
                        numberOfLines={width <= 340 ? 2 : 1}
                        style={{
                          maxWidth: '100%',
                          minHeight: width <= 340 ? 24 : 16,
                          color,
                          fontSize: width <= 340 ? 10.5 : 12,
                          lineHeight: width <= 340 ? 12 : 16,
                          textAlign: 'center',
                          fontWeight: active ? '800' : '600',
                          fontFamily: nativeUiFont,
                        }}
                      >
                        {item.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </VoiceMaterialSurface>
          </VoiceMaterialSurface>
        </MotiView>
      ) : null}
    </View>
  );
}
