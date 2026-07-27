import { Search, ChevronRight } from 'lucide-react-native';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { CharacterPortrait } from './CharacterPortrait';
import { AnimatedPressable } from './primitives';
import {
  NeumorphicSurface,
  neumorphicPalette,
} from './neumorphic-surface';

export function NeumorphicChatListDemo() {
  const { t } = useApp();
  const friends = useNanaStore(state => state.friends);
  const characters = useNanaStore(state => state.characters);
  const chatHistory = useNanaStore(state => state.chatHistory);
  const unreadCounts = useNanaStore(state => state.unreadCounts);
  const searchQuery = useNanaStore(state => state.searchQuery);
  const set = useNanaStore.setState;
  const { width, height } = useWindowDimensions();
  const compact = width <= 360 || height < 700;
  const rowHeight = compact ? 84 : 88;

  const conversations = characters
    .filter(character => friends.includes(character.id))
    .filter(character => (
      !searchQuery || character.name.toLowerCase().includes(searchQuery.toLowerCase())
    ))
    .sort((left, right) => (
      (chatHistory[right.id]?.at(-1)?.id || 0) - (chatHistory[left.id]?.at(-1)?.id || 0)
    ));

  const openChat = (characterId: string) => set(state => ({
    activeChatId: characterId,
    weChatPage: 'chat',
    unreadCounts: { ...state.unreadCounts, [characterId]: 0 },
  }));

  return (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: compact ? 5 : 10, paddingBottom: 28, gap: compact ? 12 : 16 }}
    >
      <NeumorphicSurface
        testID="neumorphic-search"
        depth="inset"
        tone="searchBlush"
        shadowProfile="light"
        radius={18}
        style={{
          minHeight: compact ? 50 : 54,
          boxShadow:
            'inset 4px 4px 7px rgba(62,48,72,0.32), inset -2px -2px 4px rgba(255,250,255,0.34), inset 1px 1px 1px rgba(76,58,84,0.10)',
        }}
        contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 }}
      >
        <Search size={20} color={neumorphicPalette.onLightSecondary} strokeWidth={1.8} />
        <TextInput
          accessibilityLabel={t.search}
          value={searchQuery}
          onChangeText={value => set({ searchQuery: value })}
          placeholder={t.search}
          placeholderTextColor={neumorphicPalette.onLightSecondary}
          selectionColor={neumorphicPalette.redPacket}
          returnKeyType="search"
          style={{
            flex: 1,
            minWidth: 0,
            color: neumorphicPalette.onLightPrimary,
            fontSize: 15,
            lineHeight: 20,
            paddingVertical: 0,
          }}
        />
      </NeumorphicSurface>

      <View style={{ paddingHorizontal: 5, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: neumorphicPalette.ink, fontSize: compact ? 17 : 19, lineHeight: 23, fontWeight: '800' }}>
            {t.conversations}
          </Text>
          {!compact ? (
            <Text style={{ color: neumorphicPalette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
              {t.conversationsSubtitle}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: neumorphicPalette.relationship, fontSize: 11, lineHeight: 16 }}>
          {t.bondCount.replace('{n}', String(conversations.length))}
        </Text>
      </View>

      <View
        testID="neumorphic-conversation-panel"
        style={{ gap: compact ? 8 : 12 }}
      >
        {conversations.map(character => {
          const lastMessage = chatHistory[character.id]?.at(-1);
          const unread = unreadCounts[character.id] || 0;

          return (
            <AnimatedPressable
              key={character.id}
              testID={`chat-row-${character.id}`}
              accessibilityRole="button"
              accessibilityLabel={t.openChatWith.replace('{name}', character.name)}
              onPress={() => openChat(character.id)}
              scale={0.992}
              style={{ width: '100%', height: rowHeight }}
            >
              <NeumorphicSurface
                depth="raised"
                tone="base"
                radius={18}
                style={{ width: '100%', height: rowHeight }}
                contentStyle={{
                  overflow: 'hidden',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  gap: 12,
                }}
              >
                <NeumorphicSurface
                  depth="raisedSmall"
                  tone="base"
                  radius={compact ? 24 : 26}
                  pointerEvents="none"
                  style={{ width: compact ? 48 : 52, height: compact ? 48 : 52 }}
                  contentStyle={{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 2.5 }}
                >
                  <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: compact ? 21.5 : 23.5, overflow: 'hidden' }}>
                    <CharacterPortrait
                      characterId={character.id}
                      avatar={character.avatar}
                      fallback={character.name[0]}
                      fontSize={21}
                    />
                  </View>
                </NeumorphicSurface>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, lineHeight: 20, fontWeight: '800' }}>
                    {character.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                    {lastMessage?.text || t.quietBeginning}
                  </Text>
                </View>

                <View style={{ width: compact ? 64 : 68, height: 52, alignItems: 'flex-end', justifyContent: lastMessage?.time ? 'space-between' : 'center' }}>
                  {lastMessage?.time ? (
                    <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] }}>
                      {lastMessage.time}
                    </Text>
                  ) : null}
                  <View style={{ width: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                    {unread > 0 ? (
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: neumorphicPalette.relationship }}>
                        <Text style={{ color: '#55404F', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                          {unread}
                        </Text>
                      </View>
                    ) : null}
                    <NeumorphicSurface
                      depth="raisedSmall"
                      tone="base"
                      radius={14}
                      pointerEvents="none"
                      style={{ width: 28, height: 28 }}
                      contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
                    >
                      <ChevronRight size={15} color={neumorphicPalette.onLightSecondary} strokeWidth={1.8} />
                    </NeumorphicSurface>
                  </View>
                </View>
              </NeumorphicSurface>
            </AnimatedPressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
