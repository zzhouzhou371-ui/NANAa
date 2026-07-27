import { Text, View } from 'react-native';
import { Compass, MessageCircle, UserRound, Users } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { ChatsTab } from './ChatsTab';
import { ContactsTab } from './ContactsTab';
import { DiscoverTab } from './DiscoverTab';
import { MeTab } from './MeTab';
import { AnimatedPressable } from './primitives';
import { triggerHaptic } from '../utils/haptics';
import { NeumorphicChatListDemo } from './neumorphic-chat-list-demo';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const SHOW_NEUMORPHIC_CHAT_DEMO = true;

const TABS = [
  { key: 'chats', Icon: MessageCircle },
  { key: 'contacts', Icon: Users },
  { key: 'discover', Icon: Compass },
  { key: 'me', Icon: UserRound },
] as const;

const TAB_ACCENTS = {
  chats: { tile: neumorphicPalette.pinkGold, ink: neumorphicPalette.onLightPrimary },
  contacts: { tile: neumorphicPalette.pinkGold, ink: neumorphicPalette.onLightPrimary },
  discover: { tile: neumorphicPalette.pinkGold, ink: neumorphicPalette.onLightPrimary },
  me: { tile: neumorphicPalette.pinkGold, ink: neumorphicPalette.onLightPrimary },
} as const;

export function ChatListView() {
  const { t } = useApp();
  const weChatTab = useNanaStore(s => s.weChatTab);
  const set = useNanaStore.setState;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {weChatTab === 'chats' && (SHOW_NEUMORPHIC_CHAT_DEMO ? <NeumorphicChatListDemo /> : <ChatsTab />)}
        {weChatTab === 'contacts' && <ContactsTab />}
        {weChatTab === 'discover' && <DiscoverTab />}
        {weChatTab === 'me' && <MeTab />}
      </View>

      <NeumorphicSurface
        testID="neumorphic-bottom-nav"
        depth="raised"
        tone="mist"
        radius={18}
        style={{ height: 60, marginTop: 6 }}
        contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 4 }}
      >
        {TABS.map(({ key, Icon }) => {
          const selected = weChatTab === key;
          const label = t[key] || key;
          const accent = TAB_ACCENTS[key];

          return (
            <AnimatedPressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => {
                triggerHaptic('light');
                set({ weChatTab: key });
              }}
              scale={0.94}
              style={{ flex: 1, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            >
              {selected ? (
                <NeumorphicSurface
                  depth="inset"
                  tone="accent"
                  radius={14}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: '50%',
                    width: 48,
                    height: 48,
                    marginLeft: -24,
                    backgroundColor: accent.tile,
                  }}
                />
              ) : null}
              <View pointerEvents="none" style={{ alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Icon
                  size={19}
                  strokeWidth={selected ? 2.1 : 1.65}
                  color={selected ? accent.ink : neumorphicPalette.onLightSecondary}
                />
                <Text
                  style={{
                    color: selected ? accent.ink : neumorphicPalette.onLightSecondary,
                    fontSize: 10.5,
                    lineHeight: 12,
                    fontWeight: selected ? '800' : '600',
                  }}
                >
                  {label}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </NeumorphicSurface>
    </View>
  );
}
