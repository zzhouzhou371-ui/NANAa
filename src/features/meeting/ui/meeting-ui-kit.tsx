import type { ReactNode } from 'react';
import { Text, View, type ColorValue } from 'react-native';
import { AnimatedPressable } from '@/components/primitives';
import { CharacterPortrait } from '@/components/CharacterPortrait';
import {
  NeumorphicSurface,
  neumorphicPalette,
  type NeumorphicTone,
} from '@/components/neumorphic-surface';
import type { MeetingCharacterOption } from './meeting-ui-types';
import { useMeetingCopy } from './use-meeting-copy';

export const meetingColors = {
  ink: '#302537',
  inkMuted: '#5D5066',
  inkSoft: '#74687D',
  inverse: '#FFF9FF',
  relationship: '#96516A',
  memory: '#52688E',
  danger: '#873E55',
  success: '#446B5C',
  scrim: 'rgba(20, 15, 35, 0.24)',
  hairline: 'rgba(60, 45, 72, 0.17)',
} as const;

export function MeetingSurface({
  children,
  tone = 'mist',
  depth = 'raisedSmall',
  radius = 18,
  style,
  contentStyle,
}: {
  children: ReactNode;
  tone?: NeumorphicTone;
  depth?: 'flat' | 'raised' | 'raisedSmall' | 'inset';
  radius?: number;
  style?: object;
  contentStyle?: object;
}) {
  return (
    <NeumorphicSurface
      tone={tone}
      depth={depth}
      radius={radius}
      fill={false}
      style={style}
      contentStyle={contentStyle}
    >
      {children}
    </NeumorphicSurface>
  );
}

export function MeetingButton({
  label,
  icon,
  onPress,
  disabled,
  tone = 'lavender',
  textColor = meetingColors.ink,
  compact = false,
  accessibilityLabel,
}: {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  tone?: NeumorphicTone;
  textColor?: ColorValue;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      scale={0.975}
      style={{ minHeight: 44, borderRadius: compact ? 14 : 16, opacity: disabled ? 0.52 : 1 }}
    >
      <MeetingSurface
        tone={tone}
        radius={compact ? 14 : 16}
        contentStyle={{
          minHeight: 44,
          paddingHorizontal: compact ? 12 : 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
        }}
      >
        {icon}
        <Text style={{ color: textColor, fontSize: 13, fontWeight: '800' }}>{label}</Text>
      </MeetingSurface>
    </AnimatedPressable>
  );
}

export function MeetingIconButton({
  icon,
  label,
  onPress,
  disabled,
  selected,
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      scale={0.965}
      style={{ width: 44, height: 44, borderRadius: 14, opacity: disabled ? 0.46 : 1 }}
    >
      <MeetingSurface
        tone={selected ? 'pinkGold' : 'lavender'}
        radius={14}
        contentStyle={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {icon}
      </MeetingSurface>
    </AnimatedPressable>
  );
}

export function MeetingAvatar({
  character,
  size = 42,
  variant = 'soft',
}: {
  character?: MeetingCharacterOption;
  size?: number;
  variant?: 'soft' | 'profile';
}) {
  const copy = useMeetingCopy();
  const fallback = character?.name?.trim().slice(0, 1) || (copy.locale === 'zh-CN' ? '见' : 'M');
  const imageAvatar = character?.avatar?.trim();
  if (variant === 'profile') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#EBC8D3',
          borderWidth: 3,
          borderColor: '#FFFDFD',
          boxShadow: '0 2px 6px rgba(88, 48, 69, 0.18)',
        }}
      >
        <CharacterPortrait
          characterId={character?.id}
          avatar={imageAvatar}
          fallback={fallback}
          color={meetingColors.ink}
          fontSize={Math.round(size * 0.36)}
        />
      </View>
    );
  }

  return (
    <MeetingSurface
      tone="champagnePink"
      radius={size / 2}
      style={{ width: size, height: size }}
      contentStyle={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      <CharacterPortrait
        characterId={character?.id}
        avatar={imageAvatar}
        fallback={fallback}
        color={meetingColors.ink}
        fontSize={Math.round(size * 0.38)}
      />
    </MeetingSurface>
  );
}

export function MeetingHeader({
  title,
  subtitle,
  left,
  right,
  compact,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: compact ? 48 : 52,
        paddingHorizontal: compact ? 12 : 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View style={{ width: 44, alignItems: 'flex-start' }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ color: meetingColors.inverse, fontSize: compact ? 16 : 17, fontWeight: '800' }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: 'rgba(255,249,255,0.78)', fontSize: 11, lineHeight: 14 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: meetingColors.inverse, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>
      {children}
    </Text>
  );
}

export function EmptyMeetingState({ onCreate }: { onCreate?: () => void }) {
  const copy = useMeetingCopy();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <MeetingSurface
        tone="lavender"
        radius={20}
        contentStyle={{ paddingHorizontal: 20, paddingVertical: 22, alignItems: 'center', gap: 12 }}
      >
        <Text style={{ color: meetingColors.ink, fontSize: 18, fontWeight: '800' }}>{copy.emptyTitle}</Text>
        <Text style={{ color: meetingColors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
          {copy.emptyBody}
        </Text>
        <View style={{ minWidth: 136 }}>
          <MeetingButton
            label={copy.createMeeting}
            onPress={onCreate}
            tone="berry"
            textColor={neumorphicPalette.onBerry}
          />
        </View>
      </MeetingSurface>
    </View>
  );
}
