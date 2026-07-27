import { useRef } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Search, Users } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { CharacterPortrait } from './CharacterPortrait';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const contactsColors = {
  letter: '#F0B3AE',
  status: neumorphicPalette.onLightSecondary,
  rail: '#E8DDEB',
} as const;

export function ContactsTab() {
  const { t } = useApp();
  const friends = useNanaStore(s => s.friends);
  const characters = useNanaStore(s => s.characters);
  const searchQuery = useNanaStore(s => s.searchQuery);
  const set = useNanaStore.setState;
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, number>>({});

  const friendChars = characters.filter(c => friends.includes(c.id));
  const filtered = searchQuery
    ? friendChars.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : friendChars;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  const grouped: Record<string, typeof sorted> = {};
  for (const character of sorted) {
    const first = character.name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : '#';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(character);
  }

  const activeLetters = Object.keys(grouped).sort();
  const showLetterRail = !searchQuery && activeLetters.length > 4;

  const handleOpenChat = (characterId: string) => {
    set(state => ({
      activeChatId: characterId,
      weChatPage: 'chat',
      unreadCounts: { ...state.unreadCounts, [characterId]: 0 },
    }));
  };

  const scrollToLetter = (letter: string) => {
    const y = sectionRefs.current[letter];
    if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <NeumorphicSurface
        testID="contacts-neumorphic-search"
        depth="inset"
        tone="searchBlush"
        radius={16}
        style={{ height: 48 }}
        contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15 }}
      >
        <Search size={17} color={neumorphicPalette.onLightSecondary} strokeWidth={1.8} />
        <TextInput
          value={searchQuery}
          onChangeText={(value) => set({ searchQuery: value })}
          placeholder={t.search}
          placeholderTextColor={neumorphicPalette.onLightSecondary}
          returnKeyType="search"
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: 0,
            color: neumorphicPalette.onLightPrimary,
            fontSize: 14,
            fontWeight: '600',
          }}
        />
      </NeumorphicSurface>

      {sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 68 }}>
          <NeumorphicSurface
            depth="raisedSmall"
            tone="base"
            radius={24}
            style={{ width: 64, height: 64, marginBottom: 18 }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <Users size={25} color={neumorphicPalette.onLightPrimary} strokeWidth={1.7} />
          </NeumorphicSurface>
          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
            {t.noFriends}
          </Text>
          <Text style={{ color: neumorphicPalette.onDarkSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 6 }}>
            {t.addFriendsToChat}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, minHeight: 0, marginTop: 14 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingLeft: 3,
              paddingRight: showLetterRail ? 38 : 3,
              paddingBottom: 24,
            }}
          >
            {activeLetters.map(letter => (
              <View
                key={letter}
                onLayout={(event) => { sectionRefs.current[letter] = event.nativeEvent.layout.y; }}
              >
                <View style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 7 }}>
                  <Text style={{ color: contactsColors.letter, fontSize: 11, fontWeight: '800' }}>{letter}</Text>
                </View>
                {grouped[letter].map(character => (
                  <AnimatedPressable
                    key={character.id}
                    accessibilityRole="button"
                    accessibilityLabel={character.name}
                    onPress={() => handleOpenChat(character.id)}
                    style={{ minHeight: 72, marginBottom: 10, borderRadius: 18 }}
                  >
                    <NeumorphicSurface
                      depth="raisedSmall"
                      tone="base"
                      radius={18}
                      style={{ width: '100%', minHeight: 72 }}
                      contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 10 }}
                    >
                      <NeumorphicSurface
                        depth="inset"
                        tone="soft"
                        radius={22}
                        style={{ width: 44, height: 44 }}
                        contentStyle={{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <CharacterPortrait
                          characterId={character.id}
                          avatar={character.avatar}
                          fallback={character.name[0] || 'N'}
                        />
                      </NeumorphicSurface>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
                          {character.name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: contactsColors.status, fontSize: 11, marginTop: 3, fontWeight: '600' }}>
                          {t.availableInWorld}
                        </Text>
                      </View>
                    </NeumorphicSurface>
                  </AnimatedPressable>
                ))}
              </View>
            ))}
          </ScrollView>

          {showLetterRail ? (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}
            >
              {activeLetters.map(letter => (
                <AnimatedPressable
                  key={letter}
                  accessibilityRole="button"
                  accessibilityLabel={letter}
                  onPress={() => scrollToLetter(letter)}
                  scale={0.85}
                  hitSlop={6}
                  style={{ width: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: contactsColors.rail, fontSize: 9, fontWeight: '800' }}>{letter}</Text>
                </AnimatedPressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
