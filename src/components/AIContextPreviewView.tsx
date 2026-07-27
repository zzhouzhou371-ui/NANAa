import { ImageBackground, View, Text, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { DEFAULT_ONLINE_PRESET } from '../constants/defaults';
import { buildAiContext } from '../services/ai';
import { useNanaStore } from '../stores/nanaStore';
import { replaceMacros } from '../utils/macros';
import { wechatTheme } from './wechatTheme';
import { wechatAssets } from './wechatAssets';

export function AIContextPreviewView() {
  const { t } = useApp();
  const activeProfileId = useNanaStore(s => s.activeProfileId);
  const activeChatId = useNanaStore(s => s.activeChatId);
  const characters = useNanaStore(s => s.characters);
  const onlinePresets = useNanaStore(s => s.onlinePresets);
  const activeOnlinePresetId = useNanaStore(s => s.activeOnlinePresetId);
  const chatHistory = useNanaStore(s => s.chatHistory);
  const worldBookEntries = useNanaStore(s => s.worldBookEntries);
  const relationshipTraces = useNanaStore(s => s.relationshipTraces);
  const myName = useNanaStore(s => s.myName);
  const myDesc = useNanaStore(s => s.myDesc);
  const lastUserMessage = useNanaStore(s => s.lastUserMessage);

  const charId = activeProfileId || activeChatId;
  const activeChar = characters.find(c => c.id === charId);
  const activePreset = onlinePresets.find(p => p.id === activeOnlinePresetId) || DEFAULT_ONLINE_PRESET;
  const history = charId ? (chatHistory[charId] || []) : [];
  const lastUserText = history.filter(m => m.sender === 'user').slice(-1)[0]?.text;
  const previewUserText = lastUserMessage || lastUserText || 'Preview message';

  if (!charId || !activeChar) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-[#71809B] text-center">{t.noCharacters}</Text>
      </View>
    );
  }

  const context = buildAiContext({
    userText: previewUserText,
    userName: myName,
    userDesc: myDesc,
    activeChar,
    activePreset,
    chatHistory: history,
    worldBookEntries,
    relationshipTraces,
    activeChatId: charId,
    replaceMacros,
  });

  return (
    <ScrollView
      className="flex-1 px-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 18 }}
    >
      <ImageBackground source={wechatAssets.sharedMemoryCard} resizeMode="cover" imageStyle={{ borderRadius: 18 }} style={{ minHeight: 156, borderRadius: 18, overflow: 'hidden', padding: 17, marginBottom: 14, justifyContent: 'flex-end', borderWidth: 0.75, borderColor: wechatTheme.line }}>
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12,17,38,0.34)' }} />
        <Text style={{ color: wechatTheme.peach, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{t.contextPreview}</Text>
        <Text style={{ color: wechatTheme.ink, fontSize: 16, fontWeight: '800' }}>{activeChar.name}</Text>
        <Text style={{ color: wechatTheme.inkMuted, fontSize: 12, marginTop: 4 }} selectable>
          {`${t.loreInjected.replace('{n}', String(context.loreCount))} | ${context.rememberedRecords.length} ${t.memRecords} | ${t.traceCount.replace('{n}', String(context.recalledTraces.length))}`}
        </Text>
      </ImageBackground>

      {context.sections.length === 0 ? (
        <View style={{ borderRadius: 16, padding: 16, backgroundColor: wechatTheme.surface }}>
          <Text style={{ color: wechatTheme.inkMuted, fontSize: 13 }}>{t.memNoContext}</Text>
        </View>
      ) : (
        context.sections.map(section => (
          <View key={section.title} style={{ borderRadius: 16, padding: 16, marginBottom: 12, backgroundColor: wechatTheme.surfaceRaised }}>
            <Text style={{ color: wechatTheme.peach, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{section.title}</Text>
            <Text style={{ color: wechatTheme.inkMuted, fontSize: 12, lineHeight: 20 }} selectable>{section.content}</Text>
          </View>
        ))
      )}

      <View style={{ borderRadius: 16, padding: 16, backgroundColor: 'rgba(14,20,43,0.62)', borderWidth: 0.75, borderColor: wechatTheme.line }}>
        <Text style={{ color: wechatTheme.peach, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{t.system}</Text>
        <Text style={{ color: wechatTheme.inkMuted, fontSize: 11, lineHeight: 20 }} selectable>
          {context.systemInstruction || t.memNoContext}
        </Text>
      </View>
    </ScrollView>
  );
}
