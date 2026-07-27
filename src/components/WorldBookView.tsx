import { useEffect, useState } from 'react';
import { BackHandler, Platform, View, Text, ScrollView, TextInput } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { MemoryEditor } from './MemoryEditor';
import type { WorldBookEntry } from '../types';
import { AnimatedPressable } from './primitives';
import { CharacterPortrait } from './CharacterPortrait';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

export { MemoryEditor };

function WorldBookField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <NeumorphicSurface
      depth="inset"
      tone="lavender"
      radius={16}
      style={{ minHeight: multiline ? 124 : 48 }}
      contentStyle={{ paddingHorizontal: 15, paddingVertical: multiline ? 12 : 0 }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={neumorphicPalette.onLightSecondary}
        multiline={multiline}
        style={{
          flex: multiline ? 1 : undefined,
          minHeight: multiline ? 100 : 48,
          paddingVertical: 0,
          color: neumorphicPalette.onLightPrimary,
          fontSize: 15,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </NeumorphicSurface>
  );
}

function WorldBookEmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 58 }}>
      <NeumorphicSurface depth="raisedSmall" tone="champagnePink" radius={24} style={{ width: 64, height: 64 }} contentStyle={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 24, fontWeight: '800' }}>W</Text>
      </NeumorphicSurface>
      <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 18 }}>{title}</Text>
      <Text style={{ color: neumorphicPalette.onDarkSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 6 }}>{subtitle}</Text>
    </View>
  );
}

export function WorldBookView() {
  const { t } = useApp();
  const worldBookView = useNanaStore(s => s.worldBookView);
  const worldBookTab = useNanaStore(s => s.worldBookTab);
  const worldBookCharId = useNanaStore(s => s.worldBookCharId);
  const worldBookEntries = useNanaStore(s => s.worldBookEntries);
  const relationshipTraces = useNanaStore(s => s.relationshipTraces);
  const editingEntryId = useNanaStore(s => s.editingEntryId);
  const editKeys = useNanaStore(s => s.editKeys);
  const editContent = useNanaStore(s => s.editContent);
  const editCharId = useNanaStore(s => s.editCharId);
  const editAlwaysActive = useNanaStore(s => s.editAlwaysActive);
  const characters = useNanaStore(s => s.characters);
  const friends = useNanaStore(s => s.friends);
  const set = useNanaStore.setState;
  const [showBindingPicker, setShowBindingPicker] = useState(false);

  useEffect(() => {
    if (!showBindingPicker || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowBindingPicker(false);
      return true;
    });
    return () => subscription.remove();
  }, [showBindingPicker]);

  const setWorldBookEntries = (updater: (prev: WorldBookEntry[]) => WorldBookEntry[]) => {
    set({ worldBookEntries: updater(worldBookEntries) });
  };

  const showCharDetail = worldBookView === 'chardetail' && worldBookCharId;
  const showEdit = worldBookView === 'edit';
  const friendChars = characters.filter(c => friends.includes(c.id));
  const traceLabels: Record<string, string> = {
    chat: t.traceChat,
    voiceMessage: t.traceVoiceMessage,
    photo: t.tracePhoto,
    payment: t.tracePayment,
    voiceCall: t.traceVoiceCall,
    videoCall: t.traceVideoCall,
    moment: t.traceMoment,
  };

  const createMemoryEntry = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    const existing = worldBookEntries.find(e => e.characterId === charId && e.group === 'memory');
    if (existing) {
      set({
        editKeys: existing.keys,
        editContent: existing.content,
        editCharId: existing.characterId || '',
        editAlwaysActive: true,
        editingEntryId: existing.id,
        worldBookView: 'edit',
      });
      return;
    }

    const id = `memory-${charId}-${Date.now()}`;
    const entry: WorldBookEntry = {
      id,
      keys: `${char?.name || 'Character'}, memory`,
      content: '',
      characterId: charId,
      group: 'memory',
      alwaysActive: true,
      records: [],
    };
    set({
      worldBookEntries: [...worldBookEntries, entry],
      editKeys: entry.keys,
      editContent: '',
      editCharId: charId,
      editAlwaysActive: true,
      editingEntryId: id,
      worldBookView: 'edit',
      islandNotification: {
        title: char?.name || t.memory,
        desc: 'Memory slot ready',
        icon: char?.avatar,
        status: 'memory',
      },
    });
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
  };

  if (showEdit) {
    const editingEntry = editingEntryId ? worldBookEntries.find(e => e.id === editingEntryId) : null;
    const isMemoryEditor = editingEntry?.group === 'memory'
      || (Array.isArray(editingEntry?.records) && (editingEntry?.records ?? []).length > 0);

    const handleSaveEntry = () => {
      if (!editKeys.trim() && !editContent.trim()) return;
      const isMemory = editingEntryId
        ? worldBookEntries.find(e => e.id === editingEntryId)?.group === 'memory'
        : false;

      if (editingEntryId) {
        setWorldBookEntries(prev => prev.map(e =>
          e.id === editingEntryId ? {
            ...e,
            keys: editKeys.trim() || e.keys,
            content: editContent.trim(),
            characterId: editCharId || undefined,
            alwaysActive: isMemory || (e.records && e.records.length > 0) ? true : editAlwaysActive,
            ...(isMemory || (e.records && e.records.length > 0) ? { group: 'memory' as const } : {}),
          } : e
        ));
      } else {
        setWorldBookEntries(prev => [...prev, {
          id: Date.now().toString(),
          keys: editKeys.trim(),
          content: editContent.trim(),
          characterId: editCharId || undefined,
          alwaysActive: editAlwaysActive,
        }]);
      }
      set({ worldBookView: worldBookCharId ? 'chardetail' : 'list' });
    };

    return (
      <View className="flex-1">
        {isMemoryEditor && editingEntry ? (
          <MemoryEditor
            entry={editingEntry}
            characters={characters}
            editContent={editContent}
            setEditContent={(v) => set({ editContent: v })}
            onSave={handleSaveEntry}
            onDelete={() => {
              if (!editingEntryId) return;
              setWorldBookEntries(prev => prev.filter(e => e.id !== editingEntryId));
              set({ worldBookView: worldBookCharId ? 'chardetail' : 'list' });
            }}
            onBack={() => set({ worldBookView: worldBookCharId ? 'chardetail' : 'list' })}
          />
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 32 }}
          >
            <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4 }}>{t.keysCsv}</Text>
            <View style={{ marginBottom: 16 }}>
              <WorldBookField value={editKeys} onChangeText={(value) => set({ editKeys: value })} placeholder={t.keysCsv} />
            </View>
            <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4 }}>{t.boundCharacter}</Text>
            <View className="mb-3">
              <AnimatedPressable
                onPress={() => setShowBindingPicker(v => !v)}
                style={{ minHeight: 48, borderRadius: 16 }}
              >
                <NeumorphicSurface pointerEvents="none" depth="inset" tone="lavender" radius={16} style={{ position: 'absolute', inset: 0 }} contentStyle={{ justifyContent: 'center', paddingHorizontal: 15 }}>
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, fontWeight: editCharId ? '700' : '800' }}>
                    {editCharId ? characters.find(c => c.id === editCharId)?.name : t.globalNoBinding}
                  </Text>
                </NeumorphicSurface>
              </AnimatedPressable>
              {showBindingPicker && (
                <NeumorphicSurface depth="raisedSmall" tone="lavender" radius={18} fill={false} style={{ marginTop: 8 }} contentStyle={{ overflow: 'hidden', paddingVertical: 4 }}>
                  <AnimatedPressable
                    onPress={() => { set({ editCharId: '' }); setShowBindingPicker(false); }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: editCharId ? 'transparent' : neumorphicPalette.pinkGold }}
                  >
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>{t.globalNoBinding}</Text>
                  </AnimatedPressable>
                  {friendChars.map(c => (
                    <AnimatedPressable
                      key={c.id}
                      onPress={() => { set({ editCharId: c.id }); setShowBindingPicker(false); }}
                      style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: editCharId === c.id ? neumorphicPalette.pinkGold : 'transparent' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: neumorphicPalette.champagnePink }}>
                          <CharacterPortrait characterId={c.id} avatar={c.avatar} fallback={c.name[0] || 'U'} fontSize={15} color={neumorphicPalette.onLightPrimary} />
                        </View>
                        <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>{c.name}</Text>
                      </View>
                    </AnimatedPressable>
                  ))}
                </NeumorphicSurface>
              )}
            </View>
            <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4 }}>{t.triggerRule}</Text>
            <NeumorphicSurface depth="inset" tone="lavender" radius={999} style={{ minHeight: 46, marginBottom: 16 }} contentStyle={{ flexDirection: 'row', gap: 4, padding: 4 }}>
              <AnimatedPressable
                onPress={() => set({ editAlwaysActive: false })}
                style={{ flex: 1, minHeight: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: !editAlwaysActive ? neumorphicPalette.pinkGold : 'transparent' }}
              >
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.keywordTriggered}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => set({ editAlwaysActive: true })}
                style={{ flex: 1, minHeight: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: editAlwaysActive ? neumorphicPalette.pinkGold : 'transparent' }}
              >
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.alwaysActive}</Text>
              </AnimatedPressable>
            </NeumorphicSurface>
            <View style={{ marginBottom: 18 }}>
              <WorldBookField value={editContent} onChangeText={(value) => set({ editContent: value })} placeholder={t.contentPlaceholder} multiline />
            </View>
            <View className="flex-row gap-3 mb-8">
              {editingEntryId && (
                <AnimatedPressable onPress={() => {
                  if (!editingEntryId) return;
                  setWorldBookEntries(prev => prev.filter(e => e.id !== editingEntryId));
                  set({ worldBookView: worldBookCharId ? 'chardetail' : 'list' });
                }} className="flex-1 py-3 rounded-full items-center" style={{ backgroundColor: neumorphicPalette.berry, boxShadow: '-3px -3px 6px rgba(255,248,255,0.30), 3px 4px 6px rgba(54,43,67,0.24)' }}>
                  <Text style={{ color: neumorphicPalette.onBerry, fontWeight: '800' }}>{t.delete}</Text>
                </AnimatedPressable>
              )}
              <AnimatedPressable onPress={handleSaveEntry} className="flex-[2] py-3 rounded-full items-center" style={{ flex: 2, backgroundColor: neumorphicPalette.pinkGold, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}>
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontWeight: '800' }}>{t.save}</Text>
              </AnimatedPressable>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  if (showCharDetail) {
    const char = characters.find(c => c.id === worldBookCharId);
    const charEntries = worldBookEntries.filter(e => e.characterId === worldBookCharId);
    const memoryEntries = charEntries.filter(e => e.group === 'memory');
    const otherEntries = charEntries.filter(e => e.group !== 'memory');
    const charTraces = relationshipTraces
      .filter(trace => trace.characterId === worldBookCharId)
      .sort((left, right) => right.occurredAt - left.occurredAt);

    return (
      <View className="flex-1">
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 40 }}
        >
          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 13, fontWeight: '800', marginBottom: 10, paddingHorizontal: 3 }}>{t.sharedMemories}</Text>
          {charTraces.length > 0 ? (
            <View style={{ gap: 12, marginBottom: 22 }}>
              {charTraces.slice(0, 8).map(trace => (
                <AnimatedPressable
                  key={trace.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${trace.title}. ${trace.summary}`}
                  accessibilityHint={trace.remember ? 'Ignore this relationship memory' : 'Remember this relationship memory'}
                  onPress={() => set(state => ({
                    relationshipTraces: state.relationshipTraces.map(item => item.id === trace.id
                      ? {
                          ...item,
                          remember: !item.remember,
                          state: item.remember ? 'ignored' : 'digested',
                          revision: item.revision + 1,
                        }
                      : item),
                  }))}
                  style={{
                    minHeight: 68,
                    borderRadius: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 11,
                    backgroundColor: trace.remember ? neumorphicPalette.pinkGold : neumorphicPalette.lavender,
                    boxShadow: trace.remember
                      ? '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)'
                      : 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>{traceLabels[trace.source] || trace.source}</Text>
                    <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10 }}>
                      {new Date(trace.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, lineHeight: 17, marginTop: 5 }}>
                    {trace.summary}
                  </Text>
                  <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, fontWeight: trace.remember ? '800' : '600', marginTop: 5 }}>
                    {trace.remember ? t.rememberedTapIgnore : t.ignoredTapRemember}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          ) : (
            <View style={{ borderRadius: 16, padding: 14, marginBottom: 18, backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)' }}>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12 }}>{t.sharedMemoryEmpty}</Text>
            </View>
          )}

          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 14, fontWeight: '800', marginBottom: 9, paddingHorizontal: 3 }}>{t.memory}</Text>
          {memoryEntries.length > 0 ? (() => {
            const mem = memoryEntries[0];
            const records = mem.records || [];
            return (
              <AnimatedPressable
                onPress={() => set({ editKeys: mem.keys, editContent: mem.content, editCharId: mem.characterId || '', editAlwaysActive: true, editingEntryId: mem.id, worldBookView: 'edit' })}
                className="rounded-2xl p-4"
                style={{
                  marginBottom: 22,
                  overflow: 'visible',
                  backgroundColor: neumorphicPalette.lavender,
                  boxShadow: '-4px -4px 8px rgba(255,248,255,0.46), 4px 5px 8px rgba(54,43,67,0.22)',
                }}
              >
                <View className="flex-row justify-between mb-2"><Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.memRecords} ({records.length})</Text></View>
                {records.slice(0, 5).map(r => (
                  <Text key={r.id} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11 }} numberOfLines={1}>[{r.time}] {r.sender === 'user' ? t.memYou : char?.name}: {r.text}</Text>
                ))}
                {mem.content ? <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, marginTop: 8 }} numberOfLines={2}>{t.memSummary}: {mem.content}</Text> : null}
                <View className="flex-row justify-end mt-3">
                  <AnimatedPressable className="px-4 py-2 rounded-full" style={{ backgroundColor: neumorphicPalette.pinkGold, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}>
                    <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.memEditEntryBtn}</Text>
                  </AnimatedPressable>
                </View>
              </AnimatedPressable>
            );
          })() : (
            <AnimatedPressable
              onPress={() => createMemoryEntry(worldBookCharId)}
              className="rounded-2xl p-5"
              style={{
                marginBottom: 22,
                overflow: 'visible',
                backgroundColor: neumorphicPalette.lavender,
                boxShadow: '-4px -4px 8px rgba(255,248,255,0.46), 4px 5px 8px rgba(54,43,67,0.22)',
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{t.memRecords} (0)</Text>
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11 }}>{t.memEditEntryBtn}</Text>
              </View>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13 }}>{t.memNoEntryYet}</Text>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, marginTop: 4 }}>{t.memNoRecords}</Text>
            </AnimatedPressable>
          )}

          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 14, fontWeight: '800', marginBottom: 9, paddingHorizontal: 3 }}>{t.otherEntries}</Text>
          {otherEntries.map(entry => (
            <WorldBookEntryCard
              key={entry.id}
              entry={entry}
              characterName={characters.find(c => c.id === entry.characterId)?.name}
              onPress={() => set({ editKeys: entry.keys, editContent: entry.content, editCharId: entry.characterId || '', editAlwaysActive: !!entry.alwaysActive, editingEntryId: entry.id, worldBookView: 'edit' })}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  const globalEntries = worldBookEntries.filter(e => !e.characterId);
  const charWithEntries = friendChars;

  return (
    <View className="flex-1">
      <NeumorphicSurface
        depth="inset"
        tone="lavender"
        radius={18}
        fill={false}
        style={{ marginHorizontal: 3, marginBottom: 18 }}
        contentStyle={{ flexDirection: 'row', gap: 4, padding: 4 }}
      >
        <AnimatedPressable
          onPress={() => set({ worldBookTab: 'global' })}
          style={{ flex: 1, height: 34, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
        >
          {worldBookTab === 'global' ? (
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="pinkGold"
              radius={15}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
          ) : null}
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
            {t.global}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => set({ worldBookTab: 'local' })}
          style={{ flex: 1, height: 34, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
        >
          {worldBookTab === 'local' ? (
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="pinkGold"
              radius={15}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
          ) : null}
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800' }}>
            {t.localRole}
          </Text>
        </AnimatedPressable>
      </NeumorphicSurface>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 40 }}
      >
        {worldBookTab === 'global' ? (
          globalEntries.length === 0 ? (
            <WorldBookEmptyState title={t.noEntries || 'No Entries'} subtitle="Add lore entries to enrich your AI's knowledge" />
          ) : (
            globalEntries.map(entry => (
              <WorldBookEntryCard
                key={entry.id}
                entry={entry}
                onPress={() => set({ editKeys: entry.keys, editContent: entry.content, editCharId: entry.characterId || '', editAlwaysActive: !!entry.alwaysActive, editingEntryId: entry.id, worldBookView: 'edit' })}
              />
            ))
          )
        ) : (
          charWithEntries.length === 0 ? (
            <WorldBookEmptyState title={t.noCharEntries || 'No Character Entries'} subtitle="Add entries bound to a specific character" />
          ) : (
            charWithEntries.map(c => {
              const entries = worldBookEntries.filter(e => e.characterId === c.id);
              const memory = entries.find(e => e.group === 'memory');
              const count = entries.length;
              const records = memory?.records?.length ?? 0;
              return (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => set({ worldBookView: 'chardetail', worldBookCharId: c.id })}
                  style={{
                    marginBottom: 20,
                    borderRadius: 14,
                    overflow: 'visible',
                    padding: 12,
                    backgroundColor: neumorphicPalette.lavender,
                    boxShadow: '-4px -4px 8px rgba(255,248,255,0.46), 4px 5px 8px rgba(54,43,67,0.22)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: 76,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: neumorphicPalette.champagnePink }}>
                      <CharacterPortrait characterId={c.id} avatar={c.avatar} fallback={c.name[0] || 'U'} fontSize={17} color={neumorphicPalette.onLightPrimary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>{c.name}</Text>
                      <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, marginTop: 2 }}>
                        {memory ? `${records} ${t.memRecords}` : t.memNoEntryYet}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      width: 96,
                      marginLeft: 12,
                      textAlign: 'right',
                      color: neumorphicPalette.onLightSecondary,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {(t.entriesCount || '{n}').replace('{n}', String(count))}
                  </Text>
                </AnimatedPressable>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

function WorldBookEntryCard({
  entry,
  characterName,
  onPress,
}: {
  entry: WorldBookEntry;
  characterName?: string;
  onPress: () => void;
}) {
  const { t } = useApp();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{ marginBottom: 22, borderRadius: 18, overflow: 'visible' }}
    >
      <NeumorphicSurface depth="raised" tone="lavender" radius={18} fill={false} contentStyle={{ padding: 13 }}>
        <View className="flex-row items-center gap-2 mb-1">
          {entry.group === 'memory' && (
            <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: neumorphicPalette.pinkGold }}>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>M</Text>
            </View>
          )}
          {entry.alwaysActive && (
            <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: neumorphicPalette.champagnePink }}>
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 10, fontWeight: '800' }}>{t.alwaysActive}</Text>
            </View>
          )}
          {!entry.alwaysActive && (
            <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 2px 2px 5px rgba(54,43,67,0.24), inset -2px -2px 5px rgba(255,248,255,0.30)' }}>
              <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, fontWeight: '800' }}>{t.keywordTriggered}</Text>
            </View>
          )}
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, fontWeight: '800', flex: 1 }}>{entry.keys}</Text>
        </View>
        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12 }} numberOfLines={2}>{entry.content}</Text>
        {characterName ? (
          <Text style={{ color: neumorphicPalette.berry, fontSize: 12, fontWeight: '800', marginTop: 4 }}>{characterName}</Text>
        ) : null}
      </NeumorphicSurface>
    </AnimatedPressable>
  );
}
