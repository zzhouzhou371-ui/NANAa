import { useId, useState, type ReactNode } from 'react';
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { neumorphicPalette } from './neumorphic-surface';
import { wechatTheme } from './wechatTheme';
import { useNanaStore } from '../stores/nanaStore';

export type ChatBubbleMaterialVariant = 'legacy' | 'borderlessGlass';
export type ChatBubbleTone = 'incoming' | 'outgoing' | 'redPacket' | 'transfer';

interface ChatBubbleSurfaceProps {
  children: ReactNode;
  contentStyle: StyleProp<ViewStyle>;
  legacyColor: string;
  legacyRadius: StyleProp<ViewStyle>;
  side: 'incoming' | 'outgoing';
  tone: ChatBubbleTone;
  variant: ChatBubbleMaterialVariant;
}

const TAIL_EXTENT = 6;
export const CHAT_BUBBLE_OUTGOING_COLOR = '#C9C0DC';
export const CHAT_BUBBLE_OUTGOING_INK = '#302537';
export const CHAT_BUBBLE_INCOMING_COLOR = '#E7D9AF';
export const CHAT_BUBBLE_INCOMING_INK = '#342B2F';

const CHAT_BUBBLE_RAISED_SMALL_SHADOW =
  '-3px -3px 7px rgba(255,255,255,0.48), 4px 5px 10px rgba(48,37,55,0.22), 1px 2px 3px rgba(48,37,55,0.24)';

const glassTones: Record<ChatBubbleTone, readonly [string, number, string, number, string, number]> = {
  incoming: ['#B0A9B6', 0.94, '#A7A0AD', 0.97, neumorphicPalette.incoming, 1],
  outgoing: ['#C3A7B4', 0.94, '#BEA0AE', 0.97, neumorphicPalette.outgoing, 1],
  redPacket: [neumorphicPalette.redPacket, 0.94, '#815064', 0.97, '#744555', 1],
  transfer: [neumorphicPalette.transfer, 0.94, '#755847', 0.97, '#694C3D', 1],
};

const neumorphicTones: Record<
  ChatBubbleTone,
  {
    color: string;
    highlightEdge: string;
    shadowEdge: string;
  }
> = {
  incoming: {
    color: CHAT_BUBBLE_INCOMING_COLOR,
    highlightEdge: 'rgba(255,250,229,0.72)',
    shadowEdge: 'rgba(91,73,42,0.28)',
  },
  outgoing: {
    color: CHAT_BUBBLE_OUTGOING_COLOR,
    highlightEdge: 'rgba(255,252,255,0.70)',
    shadowEdge: 'rgba(72,58,88,0.26)',
  },
  redPacket: {
    color: neumorphicPalette.redPacket,
    highlightEdge: 'rgba(255,226,237,0.30)',
    shadowEdge: 'rgba(45,20,29,0.46)',
  },
  transfer: {
    color: neumorphicPalette.transfer,
    highlightEdge: 'rgba(255,233,218,0.28)',
    shadowEdge: 'rgba(40,25,18,0.46)',
  },
};

function createBubblePath(bodyWidth: number, height: number, side: 'incoming' | 'outgoing') {
  const width = Math.max(1, bodyWidth);
  const safeHeight = Math.max(1, height);
  const outerWidth = width + TAIL_EXTENT;

  if (side === 'incoming') {
    return [
      'M 24 0',
      `H ${outerWidth - 17}`,
      `C ${outerWidth - 7.6} 0 ${outerWidth} 7.6 ${outerWidth} 17`,
      `V ${safeHeight - 17}`,
      `C ${outerWidth} ${safeHeight - 7.6} ${outerWidth - 7.6} ${safeHeight} ${outerWidth - 17} ${safeHeight}`,
      `H 15`,
      `C 10.6 ${safeHeight} 6 ${safeHeight - 3.6} 6 ${safeHeight - 8}`,
      'V 24.5',
      'C 5 22.8 1.4 21.1 0.2 20.5',
      'C 1.4 19.9 5.6 16 6 14',
      'C 6 6.2 13.2 0 24 0',
      'Z',
    ].join(' ');
  }

  return [
    'M 17 0',
    `H ${width - 17}`,
    `C ${width - 6.2} 0 ${width} 6.2 ${width} 14`,
    `C ${width + 0.4} 16 ${width + 4.6} 19.9 ${width + 5.8} 20.5`,
    `C ${width + 4.6} 21.1 ${width + 1} 22.8 ${width} 24.5`,
    `V ${safeHeight - 8}`,
    `C ${width} ${safeHeight - 3.6} ${width - 3.6} ${safeHeight} ${width - 8} ${safeHeight}`,
    `H 17`,
    `C 7.6 ${safeHeight} 0 ${safeHeight - 7.6} 0 ${safeHeight - 17}`,
    'V 17',
    'C 0 7.6 7.6 0 17 0',
    'Z',
  ].join(' ');
}

function BorderlessGlassShape({
  bodyWidth,
  height,
  side,
  tone,
}: {
  bodyWidth: number;
  height: number;
  side: 'incoming' | 'outgoing';
  tone: ChatBubbleTone;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const baseId = `bubble-base-${rawId}`;
  const glowId = `bubble-glow-${rawId}`;
  const path = createBubblePath(bodyWidth, height, side);
  const svgWidth = bodyWidth + TAIL_EXTENT;
  const [startColor, startOpacity, middleColor, middleOpacity, endColor, endOpacity] = glassTones[tone];

  return (
    <Svg
      pointerEvents="none"
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      style={{
        position: 'absolute',
        top: 0,
        left: side === 'incoming' ? -TAIL_EXTENT : 0,
      }}
    >
      <Defs>
        <LinearGradient id={baseId} x1="12%" y1="0%" x2="88%" y2="100%">
          <Stop offset="0" stopColor={startColor} stopOpacity={startOpacity} />
          <Stop offset="0.55" stopColor={middleColor} stopOpacity={middleOpacity} />
          <Stop offset="1" stopColor={endColor} stopOpacity={endOpacity} />
        </LinearGradient>
        <LinearGradient id={glowId} x1="0%" y1="0%" x2="82%" y2="74%">
          <Stop offset="0" stopColor="#FFF8FB" stopOpacity={tone === 'incoming' || tone === 'outgoing' ? 0.15 : 0.09} />
          <Stop offset="0.18" stopColor="#F7D4DF" stopOpacity={tone === 'incoming' || tone === 'outgoing' ? 0.09 : 0.06} />
          <Stop offset="0.42" stopColor="#EAB3C4" stopOpacity={0.025} />
          <Stop offset="0.72" stopColor="#EAB3C4" stopOpacity={0} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={path} fill={`url(#${baseId})`} />
      <Path d={path} fill={`url(#${glowId})`} />
    </Svg>
  );
}

function NeumorphicBubbleSurface({
  children,
  contentStyle,
  legacyRadius,
  side,
  tone,
}: {
  children: ReactNode;
  contentStyle: StyleProp<ViewStyle>;
  legacyRadius: StyleProp<ViewStyle>;
  side: 'incoming' | 'outgoing';
  tone: ChatBubbleTone;
}) {
  const material = neumorphicTones[tone];
  const tailSideStyle: ViewStyle = side === 'incoming'
    ? {
      left: -4,
      borderLeftColor: material.highlightEdge,
      borderBottomColor: material.shadowEdge,
    }
    : {
      right: -4,
      borderTopColor: material.highlightEdge,
      borderRightColor: material.shadowEdge,
    };

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 17,
        borderCurve: 'continuous',
      }}
    >
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 14,
            width: 10,
            height: 10,
            zIndex: 0,
            backgroundColor: material.color,
            borderWidth: 1,
            borderColor: 'transparent',
            transform: [{ rotate: '45deg' }],
          },
          tailSideStyle,
        ]}
      />
      <View
        style={[
          legacyRadius,
          {
            zIndex: 1,
            overflow: 'hidden',
            borderTopLeftRadius: 17,
            borderTopRightRadius: 17,
            borderBottomLeftRadius: 17,
            borderBottomRightRadius: 17,
            backgroundColor: material.color,
            boxShadow: CHAT_BUBBLE_RAISED_SMALL_SHADOW,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderRightWidth: 1,
            borderTopColor: material.highlightEdge,
            borderLeftColor: material.highlightEdge,
            borderBottomColor: material.shadowEdge,
            borderRightColor: material.shadowEdge,
          },
          contentStyle,
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 1,
            right: 10,
            left: 10,
            height: 1,
            borderRadius: 1,
            backgroundColor: material.highlightEdge,
            opacity: 0.42,
          }}
        />
        {children}
      </View>
    </View>
  );
}

export function ChatBubbleSurface({
  children,
  contentStyle,
  legacyColor,
  legacyRadius,
  side,
  tone,
  variant,
}: ChatBubbleSurfaceProps) {
  const chromeStyle = useNanaStore(state => state.themeConfig.chromeStyle);
  const neumorphic = chromeStyle === 'neumorphic-v1';
  const [size, setSize] = useState({ width: 0, height: 0 });
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => (
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height }
    ));
  };

  if (variant === 'legacy') {
    return (
      <View
        style={[
          legacyRadius,
          {
            backgroundColor: legacyColor,
            borderWidth: 0.5,
            borderColor: wechatTheme.line,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 13,
            [side === 'outgoing' ? 'right' : 'left']: -4,
            width: 9,
            height: 9,
            backgroundColor: legacyColor,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <View style={[legacyRadius, { overflow: 'hidden' }, contentStyle]}>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 12,
              left: 12,
              height: 1,
              backgroundColor: wechatTheme.specular,
            }}
          />
          {children}
        </View>
      </View>
    );
  }

  if (neumorphic) {
    return (
      <NeumorphicBubbleSurface
        contentStyle={contentStyle}
        legacyRadius={legacyRadius}
        side={side}
        tone={tone}
      >
        {children}
      </NeumorphicBubbleSurface>
    );
  }

  return (
    <View onLayout={handleLayout} style={{ position: 'relative' }}>
      {size.width > 0 && size.height > 0 ? (
        <BorderlessGlassShape
          bodyWidth={size.width}
          height={size.height}
          side={side}
          tone={tone}
        />
      ) : null}
      <View style={[legacyRadius, { overflow: 'hidden' }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}
