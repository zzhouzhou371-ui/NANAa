import { useEffect, useState } from 'react';
import { BackHandler, Platform, View, Text, TextInput, ScrollView, Alert } from 'react-native';
import { ChevronLeft, Trash2, Maximize2, Sparkles, Eye, GitMerge, X } from 'lucide-react-native';
import type { WorldBookEntry, Character, MemoryRecord } from '../types';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { summarizeRecords, consolidateSummary } from '../services/ai';
import { AnimatedPressable } from './primitives';
import { neumorphicPalette } from './neumorphic-surface';

interface Props {
  entry: WorldBookEntry;
  characters: Character[];
  editContent: string;
  setEditContent: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onBack: () => void;
}

function setWorldEntries(updater: (prev: WorldBookEntry[]) => WorldBookEntry[]) {
  const s = useNanaStore.getState();
  useNanaStore.setState({ worldBookEntries: updater(s.worldBookEntries) });
}

function notify(title: string, desc: string, status: 'processing' | 'success' | 'error' | 'memory' = 'memory', icon?: string) {
  useNanaStore.setState({ islandNotification: { title, desc, icon, status } });
  if (status !== 'processing') {
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2600);
  }
}

function formatRecord(record: MemoryRecord, userName: string, charName: string) {
  const who = record.sender === 'user' ? userName : charName;
  const meta = [
    record.type && record.type !== 'text' ? `[${record.type}]` : '',
    record.amount ? `$${record.amount}` : '',
    record.note || '',
  ].filter(Boolean).join(' ');
  return `[${record.time}] ${who}: ${record.text}${meta ? ` ${meta}` : ''}`;
}

export function MemoryEditor({ entry, characters, editContent, setEditContent, onSave, onDelete, onBack }: Props) {
  const { t } = useApp();
  const [expandedModule, setExpandedModule] = useState<'records' | 'summary' | 'context' | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);

  const records = [...(entry.records || [])].sort((a, b) => a.order - b.order);
  const editingEntryId = entry.id;
  const char = characters.find(c => c.id === entry.characterId);
  const charName = char?.name || t.user;
  const state = useNanaStore.getState();
  const unsummarizedRemembered = records
    .filter(r => r.remember && !r.summarized && !r.suppressedByTraceId)
    .slice(-20);

  const updateRecords = (updater: (records: MemoryRecord[]) => MemoryRecord[]) => {
    setWorldEntries(prev => prev.map(e => {
      if (e.id !== editingEntryId) return e;
      return { ...e, records: updater(e.records || []) };
    }));
  };

  const handleToggleRemember = (recordId: string) => {
    updateRecords(prev => prev.map(r => r.id === recordId ? { ...r, remember: !r.remember } : r));
  };

  const handleDeleteRecord = (recordId: string) => {
    Alert.alert(t.delete, t.memDeleteRecordConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => updateRecords(prev => prev.filter(r => r.id !== recordId)),
      },
    ]);
  };

  const handleToggleAllRemember = () => {
    const allOn = records.length > 0 && records.every(r => r.remember);
    updateRecords(prev => prev.map(r => ({ ...r, remember: !allOn })));
  };

  const handleClearAllRecords = () => {
    Alert.alert(t.memClearRecords, t.memClearRecordsConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: () => updateRecords(() => []) },
    ]);
  };

  const handleGenerateSummary = async () => {
    const selected = records.filter(r => (
      selectedRecordIds.includes(r.id)
      && !r.summarized
      && !r.suppressedByTraceId
    ));
    if (selected.length === 0) return;

    const current = useNanaStore.getState();
    if (!current.apiKey) {
      notify(t.memory, t.configureFirst, 'error', char?.avatar);
      return;
    }
    const sourceEntry = current.worldBookEntries.find(item => item.id === editingEntryId);
    const summaryGuard = sourceEntry?.summaryInvalidatedByTraceId;
    const summaryStateGuard = sourceEntry?.summaryState;

    notify(t.memory, t.memGenerating, 'processing', char?.avatar);
    setIsSummarizing(true);
    try {
      const summary = await summarizeRecords({
        records: selected,
        characterName: charName,
        userName: current.myName,
        apiUrl: current.apiUrl,
        apiKey: current.apiKey,
        selectedModel: current.selectedModel,
        language: current.themeConfig.language,
      });
      if (summary.trim()) {
        let committedContent = '';
        setWorldEntries(prev => prev.map(e => {
          if (e.id !== editingEntryId) return e;
          if (
            e.summaryInvalidatedByTraceId !== summaryGuard
            || e.summaryState !== summaryStateGuard
          ) return e;
          const existingContent = e.summaryState === 'stale' ? '' : e.content.trim();
          committedContent = existingContent
            ? `${existingContent}\n\n${summary.trim()}`
            : summary.trim();
          return {
            ...e,
            content: committedContent,
            summaryState: 'active',
            summaryInvalidatedByTraceId: undefined,
            records: (e.records || []).map(r => selectedRecordIds.includes(r.id) ? { ...r, summarized: true } : r),
          };
        }));
        if (!committedContent) {
          notify(t.memory, 'Memory changed while the summary was being generated.', 'memory', char?.avatar);
          return;
        }
        setEditContent(committedContent);
        setSelectedRecordIds([]);
        notify(t.memory, t.memoryExported.replace('{n}', String(selected.length)), 'success', char?.avatar);
      } else {
        notify(t.memory, 'Empty summary', 'error', char?.avatar);
      }
    } catch (err) {
      console.warn('Summarize failed', err);
      notify(t.memory, err instanceof Error ? err.message : 'Summarize failed', 'error', char?.avatar);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleConsolidate = async () => {
    const current = useNanaStore.getState();
    const sourceEntry = current.worldBookEntries.find(item => item.id === editingEntryId);
    const summaryGuard = sourceEntry?.summaryInvalidatedByTraceId;
    const summaryStateGuard = sourceEntry?.summaryState;
    const sourceSummary = sourceEntry?.summaryState === 'stale'
      ? ''
      : editContent.trim();
    if (!sourceSummary && unsummarizedRemembered.length === 0) return;
    if (!current.apiKey) {
      notify(t.memory, t.configureFirst, 'error', char?.avatar);
      return;
    }

    notify(t.memory, t.memConsolidating, 'processing', char?.avatar);
    setIsConsolidating(true);
    try {
      const result = await consolidateSummary({
        summary: sourceSummary,
        records: unsummarizedRemembered,
        characterName: charName,
        language: current.themeConfig.language,
        apiUrl: current.apiUrl,
        apiKey: current.apiKey,
        selectedModel: current.selectedModel,
      });
      if (result.trim()) {
        let didCommit = false;
        setWorldEntries(prev => prev.map(e => {
          if (e.id !== editingEntryId) return e;
          if (
            e.summaryInvalidatedByTraceId !== summaryGuard
            || e.summaryState !== summaryStateGuard
          ) return e;
          didCommit = true;
          return {
            ...e,
            content: result.trim(),
            summaryState: 'active',
            summaryInvalidatedByTraceId: undefined,
          };
        }));
        if (!didCommit) {
          notify(t.memory, 'Memory changed while the summary was being consolidated.', 'memory', char?.avatar);
          return;
        }
        setEditContent(result.trim());
        notify(t.memory, t.memConsolidate, 'success', char?.avatar);
      }
    } catch (err) {
      console.warn('Consolidate failed', err);
      notify(t.memory, err instanceof Error ? err.message : 'Consolidate failed', 'error', char?.avatar);
    } finally {
      setIsConsolidating(false);
    }
  };

  const estimateTokens = (text: string) => Math.ceil(text.length / 2.5);
  let contextText = '';
  if (editContent.trim()) contextText += `[Memory Summary]:\n${editContent.trim()}\n\n`;
  if (unsummarizedRemembered.length > 0) {
    contextText += `[Remembered Chat History]:\n${unsummarizedRemembered
      .map(r => formatRecord(r, state.myName || t.memYou, charName))
      .join('\n')}`;
  }
  if (!contextText) contextText = t.memNoContext;
  const contextTokens = estimateTokens(contextText);
  const tokenBudget = contextTokens > 2500;

  const toggleSelect = (id: string) => {
    setSelectedRecordIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const closeExpanded = () => {
    setExpandedModule(null);
    setSelectedRecordIds([]);
  };

  useEffect(() => {
    if (!expandedModule || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExpandedModule(null);
      setSelectedRecordIds([]);
      return true;
    });
    return () => subscription.remove();
  }, [expandedModule]);

  if (expandedModule) {
    return (
      <View className="flex-1 min-h-0">
        <View className="flex-row items-center justify-between px-1 pb-3">
          <AnimatedPressable onPress={closeExpanded} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: neumorphicPalette.lavender }}>
            <ChevronLeft size={20} color={neumorphicPalette.onLightPrimary} />
          </AnimatedPressable>
          <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 14, fontWeight: '800' }}>
            {expandedModule === 'records'
              ? t.memExpandRecords.replace('{n}', String(records.length))
              : expandedModule === 'summary'
                ? t.memExpandSummary
                : t.memExpandContext}
          </Text>
          <View className="w-9" />
        </View>

        {expandedModule === 'records' && (
          <View className="flex-1 min-h-0">
            <View className="flex-row gap-2 mb-2">
              {selectedRecordIds.length > 0 ? (
                <AnimatedPressable
                  onPress={handleGenerateSummary}
                  disabled={isSummarizing}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 14,
                    backgroundColor: neumorphicPalette.pinkGold,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: isSummarizing ? 0.7 : 1,
                  }}
                >
                  <Sparkles size={14} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                    {isSummarizing ? t.memGenerating : `${t.memGenerate} (${selectedRecordIds.length})`}
                  </Text>
                </AnimatedPressable>
              ) : (
                <View className="flex-1 flex-row gap-2">
                  <AnimatedPressable
                    onPress={handleToggleAllRemember}
                    style={{ flex: 1, minHeight: 38, borderRadius: 12, backgroundColor: neumorphicPalette.pinkGold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
                  >
                    <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '800' }}>{records.every(r => r.remember) ? t.memUnrememberAll : t.memRememberAll}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={handleClearAllRecords}
                    style={{ flex: 1, minHeight: 38, borderRadius: 12, backgroundColor: neumorphicPalette.berry, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
                  >
                    <Text numberOfLines={1} style={{ color: neumorphicPalette.onBerry, fontSize: 11, fontWeight: '800' }}>{t.memClearRecords}</Text>
                  </AnimatedPressable>
                </View>
              )}
            </View>
            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {records.length === 0 ? (
                <Text style={{ color: neumorphicPalette.onDarkSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 48 }}>{t.memNoRecords}</Text>
              ) : (
                records.map(r => {
                  const isSel = selectedRecordIds.includes(r.id);
                  return (
                    <AnimatedPressable
                      key={r.id}
                      onPress={() => { if (!r.summarized) toggleSelect(r.id); }}
                      className="p-3 rounded-[14px] mb-2"
                      style={{ backgroundColor: isSel ? neumorphicPalette.pinkGold : neumorphicPalette.lavender, opacity: r.summarized ? 0.68 : 1 }}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                          [{r.time}] {r.sender === 'user' ? t.memYou : charName}
                          {r.type && r.type !== 'text' ? ` [${r.type}]` : ''}
                          {isSel ? ' selected' : ''}
                        </Text>
                        <View className="flex-row items-center gap-2">
                          <AnimatedPressable
                            onPress={() => handleToggleRemember(r.id)}
                            style={{
                              minWidth: 74,
                              minHeight: 30,
                              borderRadius: 15,
                              paddingHorizontal: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: r.remember ? neumorphicPalette.pinkGold : neumorphicPalette.lavender,
                            }}
                          >
                            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, fontWeight: '800' }}>{r.remember ? t.memRememberOn : t.memRememberOff}</Text>
                          </AnimatedPressable>
                          <AnimatedPressable onPress={() => handleDeleteRecord(r.id)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: neumorphicPalette.berry }}>
                            <Trash2 size={14} color={neumorphicPalette.onBerry} />
                          </AnimatedPressable>
                        </View>
                      </View>
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, textDecorationLine: r.summarized ? 'line-through' : 'none' }}>
                        {formatRecord(r, t.memYou, charName)}
                      </Text>
                    </AnimatedPressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {expandedModule === 'summary' && (
          <View className="flex-1 min-h-0">
            {editContent.trim() ? (
              <View className="flex-row gap-2 mb-2">
                <AnimatedPressable
                  onPress={handleConsolidate}
                  disabled={isConsolidating}
                  className="flex-1 flex-row items-center justify-center gap-2 py-2 rounded-[14px]"
                  style={{ backgroundColor: neumorphicPalette.pinkGold }}
                >
                  <GitMerge size={14} color={neumorphicPalette.onLightPrimary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>{isConsolidating ? t.memConsolidating : t.memConsolidate}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => {
                    Alert.alert('', t.memClearSummaryConfirm, [
                      { text: t.cancel, style: 'cancel' },
                      {
                        text: t.delete,
                        style: 'destructive',
                        onPress: () => {
                          setEditContent('');
                          setWorldEntries(prev => prev.map(e => e.id === editingEntryId ? { ...e, content: '' } : e));
                        },
                      },
                    ]);
                  }}
                  className="flex-row items-center justify-center gap-1 px-3 py-2 rounded-[14px]"
                  style={{ backgroundColor: neumorphicPalette.berry }}
                >
                  <X size={14} color={neumorphicPalette.onBerry} />
                  <Text style={{ color: neumorphicPalette.onBerry, fontSize: 12, fontWeight: '800' }}>{t.memClearSummary}</Text>
                </AnimatedPressable>
              </View>
            ) : null}
            <TextInput
              value={editContent}
              onChangeText={setEditContent}
              placeholder={t.memNoSummary}
              placeholderTextColor={neumorphicPalette.onLightSecondary}
              className="flex-1 rounded-[20px] px-5 py-4 text-[14px]"
              multiline
              style={{ textAlignVertical: 'top', color: neumorphicPalette.onLightPrimary, backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)' }}
            />
          </View>
        )}

        {expandedModule === 'context' && (
          <View className="flex-1 min-h-0">
            {tokenBudget && (
              <View className="mb-2 px-3 py-2 rounded-[12px] items-center" style={{ backgroundColor: neumorphicPalette.pinkGold }}>
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>~{contextTokens} tokens - {t.memTokenWarn}</Text>
              </View>
            )}
            <ScrollView
              className="flex-1 rounded-[16px] p-4"
              style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)' }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12 }}>{contextText}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 min-h-0">
      <View className="flex-row items-center gap-2 px-1 pb-2">
        <AnimatedPressable onPress={onBack} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: neumorphicPalette.lavender }}>
          <ChevronLeft size={20} color={neumorphicPalette.onLightPrimary} />
        </AnimatedPressable>
        <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 18, fontWeight: '800', flex: 1 }} numberOfLines={1}>{t.memory}: {charName}</Text>
        <AnimatedPressable
          onPress={() => setExpandedModule('context')}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: tokenBudget ? neumorphicPalette.pinkGold : neumorphicPalette.lavender }}
        >
          <Eye size={14} color={neumorphicPalette.onLightPrimary} />
        </AnimatedPressable>
      </View>

      <ScrollView className="flex-1 px-1" showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mb-3">
          <View className="flex-row items-center justify-between mb-1 px-1">
            <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '800' }}>{t.memRecords} ({records.length})</Text>
            <AnimatedPressable onPress={() => { setSelectedRecordIds([]); setExpandedModule('records'); }}>
              <Maximize2 size={14} color={neumorphicPalette.pinkGold} />
            </AnimatedPressable>
          </View>
          <AnimatedPressable onPress={() => { setSelectedRecordIds([]); setExpandedModule('records'); }}>
            <View className="h-[180px] rounded-[16px] p-2" style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {records.length === 0 ? (
                  <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 32 }}>{t.memNoRecords}</Text>
                ) : (
                  records.map(r => (
                    <View key={r.id} className="p-2 rounded-[10px] mb-1" style={{ backgroundColor: r.summarized ? neumorphicPalette.champagnePink : neumorphicPalette.lavender, opacity: r.summarized ? 0.7 : 1 }}>
                      <View className="flex-row items-center justify-between">
                        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                          [{r.time}] {r.sender === 'user' ? t.memYou : charName}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <AnimatedPressable onPress={() => handleToggleRemember(r.id)} className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: r.remember ? neumorphicPalette.pinkGold : neumorphicPalette.lavender }}>
                            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 9 }}>{r.remember ? t.memRememberOn : t.memRememberOff}</Text>
                          </AnimatedPressable>
                          <AnimatedPressable onPress={() => handleDeleteRecord(r.id)} className="w-4 h-4 rounded-full items-center justify-center" style={{ backgroundColor: neumorphicPalette.berry }}>
                            <Trash2 size={9} color={neumorphicPalette.onBerry} />
                          </AnimatedPressable>
                        </View>
                      </View>
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 11, marginTop: 2, textDecorationLine: r.summarized ? 'line-through' : 'none' }} numberOfLines={1}>{r.text}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </AnimatedPressable>
        </View>

        <View className="mb-3">
          <View className="flex-row items-center justify-between mb-1 px-1">
            <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '800' }}>{t.memSummary}</Text>
            <AnimatedPressable onPress={() => setExpandedModule('summary')}>
              <Maximize2 size={14} color={neumorphicPalette.pinkGold} />
            </AnimatedPressable>
          </View>
          <AnimatedPressable onPress={() => setExpandedModule('summary')}>
            <View className="h-[120px] rounded-[16px] p-3" style={{ backgroundColor: neumorphicPalette.lavender, boxShadow: 'inset 3px 3px 7px rgba(54,43,67,0.24), inset -3px -3px 7px rgba(255,248,255,0.30)' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {editContent.trim() ? (
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12 }}>{editContent}</Text>
                ) : (
                  <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 32 }}>{t.memNoSummary}</Text>
                )}
              </ScrollView>
            </View>
          </AnimatedPressable>
        </View>

        <View className="flex-row gap-3 py-3">
          <AnimatedPressable onPress={onDelete} className="flex-1 py-3 rounded-[20px] items-center justify-center flex-row gap-1.5" style={{ backgroundColor: neumorphicPalette.berry }}>
            <Trash2 size={16} color={neumorphicPalette.onBerry} />
            <Text style={{ color: neumorphicPalette.onBerry, fontWeight: '800' }}>{t.memDelete}</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={onSave} className="flex-[2] py-3 rounded-[20px] items-center justify-center" style={{ flex: 2, backgroundColor: neumorphicPalette.pinkGold, boxShadow: '-3px -3px 6px rgba(255,248,255,0.42), 3px 4px 6px rgba(54,43,67,0.20)' }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontWeight: '800' }}>{t.memSave}</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </View>
  );
}
