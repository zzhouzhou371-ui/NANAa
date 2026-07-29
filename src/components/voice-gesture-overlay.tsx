import { Platform, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { create } from 'zustand';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { CHAT_BUBBLE_OUTGOING_INK } from './chat-bubble-surface';
import { wechatTheme } from './wechatTheme';

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
}

const initialVisualState: VoiceGestureVisualState = {
  visible: false,
  phase: 'idle',
  durationSec: 0,
  meteringLevel: 1,
  meteringHistory: [],
};

const useVoiceGestureVisualStore = create<VoiceGestureVisualState>(() => initialVisualState);

export function updateVoiceGestureVisual(next: VoiceGestureVisualSnapshot) {
  useVoiceGestureVisualStore.setState(current => {
    const sample = Math.max(0.12, Math.min(1, next.meteringLevel));
    const previousHistory = current.visible ? current.meteringHistory : [];
    const meteringHistory = [...previousHistory, sample].slice(-18);
    return {
      ...next,
      meteringHistory,
    };
  });
}

export function hideVoiceGestureVisual() {
  useVoiceGestureVisualStore.setState(current => (
    current.visible ? initialVisualState : current
  ));
}

const nativeUiFont = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });

function createVoiceBubblePath(width: number, height: number, tailCenter: number) {
  const bodyBottom = height - 7;
  const radius = Math.min(22, bodyBottom * 0.3, width * 0.24);
  const tailHalfWidth = Math.min(6, width * 0.1);
  const tailShoulder = Math.max(radius + 2, Math.min(width - radius - 2, tailCenter));

  return [
    `M ${radius} 0`,
    `H ${width - radius}`,
    `C ${width - radius * 0.42} 0, ${width} ${radius * 0.42}, ${width} ${radius}`,
    `V ${bodyBottom - radius}`,
    `C ${width} ${bodyBottom - radius * 0.42}, ${width - radius * 0.42} ${bodyBottom}, ${width - radius} ${bodyBottom}`,
    `H ${tailShoulder + tailHalfWidth}`,
    `C ${tailShoulder + tailHalfWidth * 0.56} ${bodyBottom}, ${tailShoulder + tailHalfWidth * 0.32} ${height - 1.8}, ${tailShoulder} ${height}`,
    `C ${tailShoulder - tailHalfWidth * 0.32} ${height - 1.8}, ${tailShoulder - tailHalfWidth * 0.56} ${bodyBottom}, ${tailShoulder - tailHalfWidth} ${bodyBottom}`,
    `H ${radius}`,
    `C ${radius * 0.42} ${bodyBottom}, 0 ${bodyBottom - radius * 0.42}, 0 ${bodyBottom - radius}`,
    `V ${radius}`,
    `C 0 ${radius * 0.42}, ${radius * 0.42} 0, ${radius} 0`,
    'Z',
  ].join(' ');
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

  if (!visual.visible || activeApp !== 'wechat' || weChatPage !== 'chat' || callVisible) return null;

  const cancelArmed = visual.phase === 'cancelArmed';
  const transcribeArmed = visual.phase === 'transcribeArmed' || visual.phase === 'converting';
  const terminalFeedback = visual.phase === 'tooShort' || visual.phase === 'converting';
  const activeAction = cancelArmed ? 'cancel' : transcribeArmed ? 'convert' : 'send';
  const centerY = height * 0.58;
  const defaultBubbleWidth = Math.min(176, width - 32);
  const cancelBubbleWidth = Math.min(78, width - 32);
  const transcribeBubbleWidth = Math.min(358, width - 24);
  const defaultBubbleHeight = 72;
  const transcribeBubbleHeight = 84;
  const bubbleWidth = cancelArmed
    ? cancelBubbleWidth
    : transcribeArmed
      ? transcribeBubbleWidth
      : defaultBubbleWidth;
  const bubbleHeight = transcribeArmed ? transcribeBubbleHeight : defaultBubbleHeight;
  const bubbleLeft = cancelArmed
    ? Math.max(18, width * 0.09)
    : transcribeArmed
      ? (width - bubbleWidth) / 2
      : (width - bubbleWidth) / 2;
  const bubbleTop = centerY - bubbleHeight / 2;
  const bubbleTailCenter = transcribeArmed ? bubbleWidth * 0.82 : bubbleWidth * 0.5;
  const bubblePath = createVoiceBubblePath(bubbleWidth, bubbleHeight, bubbleTailCenter);
  const surfaceTop = height * 0.79;
  const surfaceHeight = Math.max(116, height - surfaceTop);
  const zoneWidth = width * 0.49;
  const zoneLabelTop = surfaceTop + surfaceHeight * 0.22;
  const sendLabelTop = surfaceTop + surfaceHeight * 0.7;
  // Match WeChat's actual gesture skeleton: two floating fan-shaped slide
  // targets with rounded inner noses above one broad, shallow send arc.
  // Ratios are measured from the 1440 x 3200 reference screenshot.
  const leftActionPath = [
    `M ${-width * 0.07} ${surfaceHeight * 0.23}`,
    `C ${width * 0.06} ${surfaceHeight * 0.16}, ${width * 0.24} ${surfaceHeight * 0.06}, ${width * 0.35} ${surfaceHeight * 0.043}`,
    `C ${width * 0.38} ${surfaceHeight * 0.038}, ${width * 0.405} ${surfaceHeight * 0.035}, ${width * 0.42} ${surfaceHeight * 0.052}`,
    `C ${width * 0.44} ${surfaceHeight * 0.074}, ${width * 0.457} ${surfaceHeight * 0.112}, ${width * 0.468} ${surfaceHeight * 0.153}`,
    `C ${width * 0.475} ${surfaceHeight * 0.18}, ${width * 0.475} ${surfaceHeight * 0.23}, ${width * 0.471} ${surfaceHeight * 0.269}`,
    `C ${width * 0.464} ${surfaceHeight * 0.322}, ${width * 0.44} ${surfaceHeight * 0.377}, ${width * 0.398} ${surfaceHeight * 0.401}`,
    `C ${width * 0.37} ${surfaceHeight * 0.407}, ${width * 0.335} ${surfaceHeight * 0.414}, ${width * 0.3} ${surfaceHeight * 0.422}`,
    `C ${width * 0.2} ${surfaceHeight * 0.447}, ${width * 0.09} ${surfaceHeight * 0.515}, ${-width * 0.07} ${surfaceHeight * 0.61}`,
    'Z',
  ].join(' ');
  const rightActionPath = [
    `M ${width * 1.07} ${surfaceHeight * 0.23}`,
    `C ${width * 0.94} ${surfaceHeight * 0.16}, ${width * 0.76} ${surfaceHeight * 0.06}, ${width * 0.65} ${surfaceHeight * 0.043}`,
    `C ${width * 0.62} ${surfaceHeight * 0.038}, ${width * 0.595} ${surfaceHeight * 0.035}, ${width * 0.58} ${surfaceHeight * 0.052}`,
    `C ${width * 0.56} ${surfaceHeight * 0.074}, ${width * 0.543} ${surfaceHeight * 0.112}, ${width * 0.532} ${surfaceHeight * 0.153}`,
    `C ${width * 0.525} ${surfaceHeight * 0.18}, ${width * 0.525} ${surfaceHeight * 0.23}, ${width * 0.529} ${surfaceHeight * 0.269}`,
    `C ${width * 0.536} ${surfaceHeight * 0.322}, ${width * 0.56} ${surfaceHeight * 0.377}, ${width * 0.602} ${surfaceHeight * 0.401}`,
    `C ${width * 0.63} ${surfaceHeight * 0.407}, ${width * 0.665} ${surfaceHeight * 0.414}, ${width * 0.7} ${surfaceHeight * 0.422}`,
    `C ${width * 0.8} ${surfaceHeight * 0.447}, ${width * 0.91} ${surfaceHeight * 0.515}, ${width * 1.07} ${surfaceHeight * 0.61}`,
    'Z',
  ].join(' ');
  const sendActionPath = [
    `M ${-width * 0.07} ${surfaceHeight * 0.72}`,
    `C ${-width * 0.025} ${surfaceHeight * 0.688}, ${width * 0.055} ${surfaceHeight * 0.625}, ${width * 0.1} ${surfaceHeight * 0.601}`,
    `C ${width * 0.19} ${surfaceHeight * 0.551}, ${width * 0.29} ${surfaceHeight * 0.516}, ${width * 0.4} ${surfaceHeight * 0.496}`,
    `C ${width * 0.435} ${surfaceHeight * 0.49}, ${width * 0.47} ${surfaceHeight * 0.485}, ${width * 0.5} ${surfaceHeight * 0.485}`,
    `C ${width * 0.53} ${surfaceHeight * 0.485}, ${width * 0.565} ${surfaceHeight * 0.49}, ${width * 0.6} ${surfaceHeight * 0.496}`,
    `C ${width * 0.71} ${surfaceHeight * 0.516}, ${width * 0.81} ${surfaceHeight * 0.551}, ${width * 0.9} ${surfaceHeight * 0.601}`,
    `C ${width * 0.945} ${surfaceHeight * 0.625}, ${width * 1.025} ${surfaceHeight * 0.688}, ${width * 1.07} ${surfaceHeight * 0.72}`,
    `L ${width * 1.07} ${surfaceHeight * 1.06}`,
    `L ${-width * 0.07} ${surfaceHeight * 1.06}`,
    'Z',
  ].join(' ');
  const remainingSeconds = visual.durationSec >= 50 ? Math.max(0, 60 - visual.durationSec) : null;
  const meteringHistory = [
    ...Array(Math.max(0, 18 - visual.meteringHistory.length)).fill(0.12),
    ...visual.meteringHistory,
  ];
  const displayedMeteringHistory = cancelArmed
    ? meteringHistory.slice(-10)
    : transcribeArmed
      ? meteringHistory.slice(-12)
      : meteringHistory.slice(-16);
  const waveformWidth = cancelArmed
    ? Math.min(30, bubbleWidth * 0.38)
    : transcribeArmed
      ? Math.min(44, bubbleWidth * 0.13)
      : Math.min(70, bubbleWidth * 0.4);
  const bubbleFill = cancelArmed
    ? { top: '#E77895', middle: '#B54164', bottom: '#5B2037', topOpacity: 0.55, middleOpacity: 0.68, bottomOpacity: 0.8 }
    : transcribeArmed
      ? { top: '#D59BB2', middle: '#9D5776', bottom: '#3B1E30', topOpacity: 0.42, middleOpacity: 0.56, bottomOpacity: 0.73 }
      : { top: '#D59BB2', middle: '#9D5776', bottom: '#3B1E30', topOpacity: 0.42, middleOpacity: 0.57, bottomOpacity: 0.74 };

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
        // Keep the simulated system clock and signal legible above the scrim;
        // the chat header and composer remain underneath this root-level layer.
        zIndex: 55,
        overflow: 'hidden',
        backgroundColor: 'rgba(2, 1, 6, 0.72)',
      }}
    >
      <LinearGradient
        colors={['rgba(18, 4, 17, 0)', 'rgba(9, 1, 11, 0.36)', 'rgba(4, 0, 7, 0.66)']}
        locations={[0, 0.32, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          top: height * 0.44,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 0,
          opacity: 1,
        }}
      />
      <LinearGradient
        colors={['rgba(3, 0, 6, 0)', 'rgba(3, 0, 6, 0.84)', 'rgba(2, 0, 5, 0.93)']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          top: surfaceTop - 54,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 0,
        }}
      />

      <View
        testID="voice-gesture-bubble"
        style={{
          position: 'absolute',
          top: bubbleTop,
          left: bubbleLeft,
          width: bubbleWidth,
          height: bubbleHeight,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3,
        }}
      >
        <Svg
          width={bubbleWidth}
          height={bubbleHeight}
          viewBox={`0 0 ${bubbleWidth} ${bubbleHeight}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          <Defs>
            <SvgLinearGradient id="voiceBubbleFill" x1={0} y1={0} x2={0} y2={bubbleHeight} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={bubbleFill.top} stopOpacity={bubbleFill.topOpacity * 0.72} />
              <Stop offset="0.34" stopColor={bubbleFill.middle} stopOpacity={bubbleFill.middleOpacity} />
              <Stop offset="1" stopColor={bubbleFill.bottom} stopOpacity={bubbleFill.bottomOpacity} />
            </SvgLinearGradient>
            <SvgLinearGradient id="voiceBubbleSheen" x1={0} y1={0} x2={0} y2={bubbleHeight * 0.42} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFF5F8" stopOpacity="0.075" />
              <Stop offset="0.42" stopColor="#FFF5F8" stopOpacity="0.025" />
              <Stop offset="1" stopColor="#FFF5F8" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="voiceBubbleDepth" x1={0} y1={bubbleHeight * 0.35} x2={0} y2={bubbleHeight} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#050207" stopOpacity="0" />
              <Stop offset="1" stopColor="#050207" stopOpacity="0.14" />
            </SvgLinearGradient>
          </Defs>
          <Path d={bubblePath} fill="url(#voiceBubbleFill)" />
          <Path d={bubblePath} fill="url(#voiceBubbleSheen)" />
          <Path d={bubblePath} fill="url(#voiceBubbleDepth)" />
        </Svg>

        {terminalFeedback ? (
          <Text
            numberOfLines={1}
            style={{
              maxWidth: bubbleWidth - 24,
              color: wechatTheme.ink,
              fontSize: 13,
              lineHeight: 18,
              fontWeight: '700',
              fontFamily: nativeUiFont,
            }}
          >
            {visual.phase === 'converting' ? t.processing : t.recordingTooShort}
          </Text>
        ) : (
          <>
            {transcribeArmed ? (
              <View style={{ position: 'absolute', top: bubbleHeight * 0.25, bottom: bubbleHeight * 0.25, left: 22, width: 2, borderRadius: 1, backgroundColor: wechatTheme.peach }} />
            ) : null}
            <View
              style={{
                position: transcribeArmed ? 'absolute' : 'relative',
                right: transcribeArmed ? 28 : undefined,
                width: waveformWidth,
                height: bubbleHeight * 0.46,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: width <= 340 ? 1 : 1.4,
              }}
            >
              {displayedMeteringHistory.map((sample, index) => (
                <MotiView
                  key={index}
                  animate={{ scaleY: Math.max(0.14, sample) }}
                  transition={{ type: 'timing', duration: 150 }}
                  style={{
                    flex: 1,
                    maxWidth: 2.6,
                    height: bubbleHeight * 0.42,
                    borderRadius: 2,
                    backgroundColor: 'rgba(48, 20, 38, 0.96)',
                  }}
                />
              ))}
            </View>
            {remainingSeconds !== null ? (
              <Text style={{ position: 'absolute', bottom: 5, color: 'rgba(255, 241, 238, 0.88)', fontSize: 11, lineHeight: 14, fontWeight: '700', fontFamily: nativeUiFont, fontVariant: ['tabular-nums'] }}>
                {remainingSeconds}s
              </Text>
            ) : null}
          </>
        )}
      </View>

      {!terminalFeedback ? (
        <>
          {cancelArmed ? (
            <Text style={{ position: 'absolute', top: surfaceTop - 31, left: 18, width: zoneWidth, zIndex: 4, color: 'rgba(255, 241, 238, 0.76)', fontSize: 13, lineHeight: 18, textAlign: 'center', fontWeight: '600', fontFamily: nativeUiFont }}>
              {t.releaseToCancel}
            </Text>
          ) : null}
          {transcribeArmed ? (
            <Text style={{ position: 'absolute', top: surfaceTop - 31, right: 18, width: zoneWidth, zIndex: 4, color: 'rgba(255, 241, 238, 0.76)', fontSize: 13, lineHeight: 18, textAlign: 'center', fontWeight: '600', fontFamily: nativeUiFont }}>
              {t.releaseToConvert}
            </Text>
          ) : null}

          <Svg
            testID="voice-gesture-surface"
            width={width}
            height={surfaceHeight}
            viewBox={`0 0 ${width} ${surfaceHeight}`}
            style={{
              position: 'absolute',
              top: surfaceTop,
              left: 0,
              zIndex: 1,
            }}
          >
            <Defs>
              <SvgLinearGradient id="voiceActionBase" x1={width * 0.5} y1={0} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#5A3A4C" stopOpacity="0.54" />
                <Stop offset="0.58" stopColor="#352332" stopOpacity="0.74" />
                <Stop offset="1" stopColor="#160F18" stopOpacity="0.92" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceSendBase" x1={width * 0.5} y1={surfaceHeight * 0.52} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#452D3C" stopOpacity="0.72" />
                <Stop offset="1" stopColor="#120C15" stopOpacity="0.96" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceSurfaceSheen" x1={width * 0.5} y1={0} x2={width * 0.5} y2={surfaceHeight * 0.46} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FFF5F8" stopOpacity="0.08" />
                <Stop offset="0.38" stopColor="#FFF5F8" stopOpacity="0.028" />
                <Stop offset="1" stopColor="#FFF5F8" stopOpacity="0" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceSurfaceDepth" x1={width * 0.5} y1={surfaceHeight * 0.24} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#050207" stopOpacity="0" />
                <Stop offset="0.72" stopColor="#050207" stopOpacity="0.07" />
                <Stop offset="1" stopColor="#050207" stopOpacity="0.2" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceCancelLift" x1={0} y1={0} x2={width * 0.36} y2={surfaceHeight * 0.5} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FFF9FB" stopOpacity="0.98" />
                <Stop offset="0.52" stopColor="#F2E2E8" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#DCC7D0" stopOpacity="0.92" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceConvertLift" x1={width} y1={0} x2={width * 0.64} y2={surfaceHeight * 0.5} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FFF9FB" stopOpacity="0.98" />
                <Stop offset="0.52" stopColor="#F2E2E8" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#DCC7D0" stopOpacity="0.92" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceSendLift" x1={width * 0.5} y1={surfaceHeight * 0.54} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#EFCEDB" stopOpacity="0.42" />
                <Stop offset="1" stopColor="#A86983" stopOpacity="0.18" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceNeuCancelRaised" x1={0} y1={0} x2={width * 0.42} y2={surfaceHeight * 0.48} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#D5A9BA" />
                <Stop offset="0.48" stopColor="#B98298" />
                <Stop offset="1" stopColor="#9F667D" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceNeuConvertRaised" x1={width} y1={0} x2={width * 0.58} y2={surfaceHeight * 0.48} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#CCD3E6" />
                <Stop offset="0.48" stopColor="#ADB7D5" />
                <Stop offset="1" stopColor="#909CBE" />
              </SvgLinearGradient>
              <SvgLinearGradient id="voiceNeuSendRaised" x1={width * 0.5} y1={surfaceHeight * 0.48} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#E3DDEF" />
                <Stop offset="0.46" stopColor="#C9C0DC" />
                <Stop offset="1" stopColor="#ACA1C1" />
              </SvgLinearGradient>
            </Defs>

            {neumorphic ? (
              <>
                <Path d={leftActionPath} fill="#3B2936" fillOpacity={0.24} transform="translate(0 3.5)" />
                <Path d={rightActionPath} fill="#31364A" fillOpacity={0.24} transform="translate(0 3.5)" />
                <Path d={sendActionPath} fill="#3C3349" fillOpacity={0.26} transform="translate(0 3.5)" />
                <Path d={leftActionPath} fill="url(#voiceNeuCancelRaised)" opacity={cancelArmed ? 0.96 : 1} />
                <Path d={rightActionPath} fill="url(#voiceNeuConvertRaised)" opacity={transcribeArmed ? 0.96 : 1} />
                <Path d={sendActionPath} fill="url(#voiceNeuSendRaised)" opacity={cancelArmed || transcribeArmed ? 0.8 : 1} />
                <Path d={leftActionPath} fill="none" stroke="rgba(255,246,251,0.58)" strokeWidth={1} />
                <Path d={rightActionPath} fill="none" stroke="rgba(250,252,255,0.62)" strokeWidth={1} />
                <Path d={sendActionPath} fill="none" stroke="rgba(255,252,255,0.62)" strokeWidth={1} />
              </>
            ) : (
              <>
                <Path d={leftActionPath} fill="url(#voiceActionBase)" />
                <Path d={rightActionPath} fill="url(#voiceActionBase)" />
                <Path d={sendActionPath} fill="url(#voiceSendBase)" />
                {!cancelArmed && !transcribeArmed ? <Path d={sendActionPath} fill="url(#voiceSendLift)" /> : null}
                <Path d={leftActionPath} fill="url(#voiceSurfaceSheen)" />
                <Path d={rightActionPath} fill="url(#voiceSurfaceSheen)" />
                <Path d={sendActionPath} fill="url(#voiceSurfaceSheen)" />
                <Path d={leftActionPath} fill="url(#voiceSurfaceDepth)" />
                <Path d={rightActionPath} fill="url(#voiceSurfaceDepth)" />
                <Path d={sendActionPath} fill="url(#voiceSurfaceDepth)" />
                {cancelArmed ? <Path d={leftActionPath} fill="url(#voiceCancelLift)" /> : null}
                {transcribeArmed ? <Path d={rightActionPath} fill="url(#voiceConvertLift)" /> : null}
              </>
            )}
          </Svg>

          {neumorphic ? (
            <MotiView
              key={`voice-action-${activeAction}`}
              pointerEvents="none"
              from={{ opacity: 0.82, scale: 0.99 }}
              animate={{ opacity: 1, scale: activeAction === 'send' ? 1.02 : 1.025 }}
              transition={{ type: 'timing', duration: 160 }}
              style={{
                position: 'absolute',
                top: surfaceTop,
                left: 0,
                width,
                height: surfaceHeight,
                zIndex: 2,
              }}
            >
              <Svg width={width} height={surfaceHeight} viewBox={`0 0 ${width} ${surfaceHeight}`}>
                <Defs>
                  <SvgLinearGradient id="voiceNeuCancelInset" x1={0} y1={0} x2={width * 0.42} y2={surfaceHeight * 0.48} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#8E5870" />
                    <Stop offset="0.52" stopColor="#B98298" />
                    <Stop offset="1" stopColor="#D8AEC0" />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="voiceNeuConvertInset" x1={width} y1={0} x2={width * 0.58} y2={surfaceHeight * 0.48} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#8792B3" />
                    <Stop offset="0.52" stopColor="#ADB7D5" />
                    <Stop offset="1" stopColor="#D2D8E9" />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="voiceNeuSendActive" x1={width * 0.5} y1={surfaceHeight * 0.48} x2={width * 0.5} y2={surfaceHeight} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#E8E3F3" />
                    <Stop offset="0.52" stopColor="#C9C0DC" />
                    <Stop offset="1" stopColor="#A99EBE" />
                  </SvgLinearGradient>
                </Defs>
                {activeAction === 'cancel' ? (
                  <>
                    <Path d={leftActionPath} fill="url(#voiceNeuCancelInset)" />
                    <Path d={leftActionPath} fill="none" stroke="rgba(70,39,54,0.54)" strokeWidth={1.4} transform="translate(0 -0.5)" />
                    <Path d={leftActionPath} fill="none" stroke="rgba(255,247,251,0.48)" strokeWidth={1} transform="translate(0 1)" />
                  </>
                ) : activeAction === 'convert' ? (
                  <>
                    <Path d={rightActionPath} fill="url(#voiceNeuConvertInset)" />
                    <Path d={rightActionPath} fill="none" stroke="rgba(49,55,79,0.52)" strokeWidth={1.4} transform="translate(0 -0.5)" />
                    <Path d={rightActionPath} fill="none" stroke="rgba(252,253,255,0.50)" strokeWidth={1} transform="translate(0 1)" />
                  </>
                ) : (
                  <>
                    <Path d={sendActionPath} fill="url(#voiceNeuSendActive)" />
                    <Path d={sendActionPath} fill="none" stroke="rgba(255,252,255,0.72)" strokeWidth={1.1} />
                  </>
                )}
              </Svg>
            </MotiView>
          ) : null}

          <MotiView
            animate={{ scale: cancelArmed && neumorphic ? 1.025 : 1 }}
            transition={{ type: 'timing', duration: 160 }}
            style={{
              position: 'absolute',
              top: zoneLabelTop,
              left: 0,
              width: zoneWidth,
              zIndex: 4,
            }}
          >
            <Text
            style={{
              width: '100%',
              color: cancelArmed ? '#3A1F2B' : neumorphic ? '#4A2D3A' : wechatTheme.ink,
              fontSize: 14,
              lineHeight: 19,
              textAlign: 'center',
              fontWeight: cancelArmed && neumorphic ? '800' : '600',
              fontFamily: nativeUiFont,
              transform: [{ rotate: '-6deg' }],
            }}
          >
            {t.cancel}
            </Text>
          </MotiView>

          <MotiView
            animate={{ scale: transcribeArmed && neumorphic ? 1.025 : 1 }}
            transition={{ type: 'timing', duration: 160 }}
            style={{
              position: 'absolute',
              top: zoneLabelTop,
              right: 0,
              width: zoneWidth,
              zIndex: 4,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
              width: '100%',
              color: transcribeArmed ? '#293149' : neumorphic ? '#39425E' : wechatTheme.ink,
              fontSize: width <= 340 ? 12 : 13,
              lineHeight: 18,
              textAlign: 'center',
              fontWeight: transcribeArmed && neumorphic ? '800' : '600',
              fontFamily: nativeUiFont,
              transform: [{ rotate: '6deg' }],
            }}
          >
            {transcribeArmed ? t.convertToText : t.slideHereToConvert}
            </Text>
          </MotiView>

          <MotiView
            animate={{ scale: activeAction === 'send' && neumorphic ? 1.02 : 1 }}
            transition={{ type: 'timing', duration: 160 }}
            style={{
              position: 'absolute',
              top: sendLabelTop,
              left: 0,
              width,
              zIndex: 4,
            }}
          >
            <Text
              style={{
              width: '100%',
              color: cancelArmed || transcribeArmed
                ? neumorphic ? 'rgba(48,37,55,0.66)' : wechatTheme.ink
                : neumorphic ? CHAT_BUBBLE_OUTGOING_INK : '#281521',
              fontSize: 15,
              lineHeight: 20,
              textAlign: 'center',
              fontWeight: activeAction === 'send' && neumorphic ? '800' : '600',
              fontFamily: nativeUiFont,
            }}
          >
            {cancelArmed || transcribeArmed ? t.voiceGestureMode : t.releaseToSend}
            </Text>
          </MotiView>
        </>
      ) : null}
    </View>
  );
}
