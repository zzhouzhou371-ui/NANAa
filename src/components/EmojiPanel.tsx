import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { NeumorphicSurface } from './neumorphic-surface';
import { AnimatedPressable } from './primitives';

const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: ['😀', '😄', '😁', '😊', '😉', '😍', '😘', '😋', '😎', '🥰', '😇', '🙂', '😂', '🤣', '🥲', '😭', '😤', '😡', '😴', '🤔', '😳', '🥺', '😱', '😏'],
  },
  {
    name: 'Gestures',
    icon: '👍',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🙏', '💪', '👋', '🤝', '🫶', '☝️', '👇', '👈', '👉'],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: ['❤️', '🩷', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  },
  {
    name: 'Animals',
    icon: '🐱',
    emojis: ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐧', '🐥', '🦄', '🐺', '🐙', '🐠', '🦋', '🐾'],
  },
  {
    name: 'Nature',
    icon: '🌙',
    emojis: ['🌙', '☀️', '⭐', '✨', '🌈', '☁️', '🔥', '🌊', '🌸', '🌹', '🌻', '🍀', '🍁', '🍓', '🍰', '🍵', '🍷', '🎀'],
  },
  {
    name: 'Objects',
    icon: '🎁',
    emojis: ['🎁', '🎉', '🎀', '🎵', '🎧', '📷', '📱', '💌', '🔮', '🧸', '📚', '🕯️', '💎', '☕', '🍭', '🍫', '🎮', '🗝️'],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
}

export function EmojiPanel({ onSelect }: Props) {
  const [activeCat, setActiveCat] = useState(0);
  const active = EMOJI_CATEGORIES[activeCat];

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <View style={{ height: 52, justifyContent: 'center' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center', gap: 8 }}
        >
          {EMOJI_CATEGORIES.map((cat, i) => (
            <AnimatedPressable
              key={cat.name}
              onPress={() => setActiveCat(i)}
              scale={0.9}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <NeumorphicSurface
                pointerEvents="none"
                depth={activeCat === i ? 'inset' : 'raisedSmall'}
                tone={activeCat === i ? 'accent' : 'base'}
                radius={19}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
              <Text pointerEvents="none" style={{ fontSize: 22, lineHeight: 28 }}>{cat.icon}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {active.emojis.map((emoji, i) => (
            <AnimatedPressable
              key={`${active.name}-${i}`}
              onPress={() => onSelect(emoji)}
              scale={0.85}
              style={{
                width: '14.2857%',
                height: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 16,
              }}
            >
              <Text style={{ fontSize: 27, lineHeight: 34 }}>{emoji}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
