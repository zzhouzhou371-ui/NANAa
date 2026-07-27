import { useState } from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable } from './primitives';
import { wechatTheme } from './wechatTheme';
import { wechatAssets } from './wechatAssets';
import { CharacterPortrait } from './CharacterPortrait';

export function MomentsView() {
  const momentsList = useNanaStore(s => s.momentsList);
  const set = useNanaStore.setState;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1">
        {/* Cover */}
        <Image source={wechatAssets.momentsCover} resizeMode="cover" style={{ width: '100%', height: 208 }} />

        <View className="px-4 pt-4">
          {momentsList.map(m => (
            <View key={m.id} style={{ marginBottom: 14, borderRadius: 16, padding: 14, backgroundColor: wechatTheme.surface, borderWidth: 0.75, borderColor: wechatTheme.line }}>
              <View className="flex-row items-center gap-3 mb-2">
                <View className="w-10 h-10 rounded-xl bg-white/60 items-center justify-center overflow-hidden">
                  <CharacterPortrait characterId={m.authorId} avatar={m.avatar} fallback={m.authorName[0] || 'N'} />
                </View>
                <View>
                  <Text style={{ color: wechatTheme.ink, fontSize: 14, fontWeight: '700' }}>{m.authorName}</Text>
                  <Text style={{ color: wechatTheme.inkSoft, fontSize: 10 }}>{new Date(m.timestamp).toLocaleString()}</Text>
                </View>
              </View>
              <Text style={{ color: wechatTheme.inkMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>{m.text}</Text>
              {m.images?.map((img, i) => <MomentImage key={`${img}-${i}`} uri={img} />)}
            </View>
          ))}
        </View>
      </ScrollView>

      <AnimatedPressable
        onPress={() => set({ showComposeMoment: true })}
        className="absolute right-4 top-4 w-10 h-10 rounded-full items-center justify-center bg-white/80"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 }}
      >
        <Plus size={19} color="#63728E" />
      </AnimatedPressable>
    </View>
  );
}

function MomentImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed || !/^https?:\/\//i.test(uri)) return null;
  return (
    <Image
      source={{ uri }}
      resizeMode="cover"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      style={{ width: '100%', height: loaded ? 190 : 1, opacity: loaded ? 1 : 0, borderRadius: 12, marginTop: loaded ? 6 : 0 }}
    />
  );
}
