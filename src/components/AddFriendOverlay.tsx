import { View, Text, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { GradientButton, NativeGradient } from './primitives';
import { wechatTheme } from './wechatTheme';
import { CharacterPortrait } from './CharacterPortrait';
import { createAddFriendPatch } from '../services/friendshipRuntime';

export function AddFriendOverlay() {
  const { t } = useApp();
  const characters = useNanaStore(s => s.characters);
  const friends = useNanaStore(s => s.friends);
  const set = useNanaStore.setState;

  const unfriended = characters.filter(c => !friends.includes(c.id));

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 50, paddingHorizontal: 16, paddingVertical: 20, backgroundColor: 'rgba(24,31,58,0.97)' }}>
      <View className="flex-row justify-between items-center mb-5">
        <GradientButton variant="ghost" onPress={() => set({ showAddFriend: false })}>
          <Text className="text-[#645A79] font-medium text-sm">{t.cancel}</Text>
        </GradientButton>
        <Text style={{ color: wechatTheme.ink, fontWeight: '800' }}>{t.addCharacter}</Text>
        <View className="w-[66px]" />
      </View>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {unfriended.map(char => (
          <View key={char.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 12, marginBottom: 10, backgroundColor: wechatTheme.surfaceRaised, borderWidth: 0.75, borderColor: wechatTheme.line }}>
            <View className="flex-row items-center gap-3">
              <NativeGradient direction="to-br" colors={['#FFFFFF', '#D9EEFF']} borderRadius={12} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <CharacterPortrait characterId={char.id} avatar={char.avatar} fallback={char.name[0] || 'N'} />
              </NativeGradient>
              <Text style={{ color: wechatTheme.ink, fontWeight: '700' }}>{char.name}</Text>
            </View>
            <GradientButton
              variant="primary"
              onPress={() => set(s => ({
                ...createAddFriendPatch(s, char),
                showAddFriend: false,
              }))}
            >
              <Text className="text-[#5E5672] text-[13px] font-semibold">{t.add}</Text>
            </GradientButton>
          </View>
        ))}
        {unfriended.length === 0 && (
          <Text className="text-center text-[#71809B] text-sm mt-10">{t.noNewCharacters}</Text>
        )}
      </ScrollView>
    </View>
  );
}
