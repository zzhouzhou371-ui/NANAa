import { useState } from 'react';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import type { Preset } from '../types';
import { AnimatedPressable } from './primitives';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

interface PresetEditorFormProps {
  editingPreset: Preset | null;
}

function PresetField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: neumorphicPalette.onDarkPrimary, fontSize: 12, fontWeight: '700', marginBottom: 8, paddingHorizontal: 4 }}>
        {label}
      </Text>
      <NeumorphicSurface
        depth="inset"
        tone="lavender"
        radius={16}
        style={{ minHeight: multiline ? 112 : 48 }}
        contentStyle={{ paddingHorizontal: 15, paddingVertical: multiline ? 12 : 0, justifyContent: multiline ? 'flex-start' : 'center' }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={neumorphicPalette.onLightSecondary}
          multiline={multiline}
          style={{
            flex: multiline ? 1 : undefined,
            minHeight: multiline ? 88 : 46,
            paddingVertical: 0,
            color: neumorphicPalette.onLightPrimary,
            fontSize: 15,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </NeumorphicSurface>
    </View>
  );
}

function PresetEditorForm({ editingPreset }: PresetEditorFormProps) {
  const { t } = useApp();
  const presetMode = useNanaStore(s => s.presetMode);
  const onlinePresets = useNanaStore(s => s.onlinePresets);
  const offlinePresets = useNanaStore(s => s.offlinePresets);
  const set = useNanaStore.setState;
  const [name, setName] = useState(editingPreset?.name || '');
  const [sceneDescription, setSceneDescription] = useState(editingPreset?.sceneDescription || '');
  const [main, setMain] = useState(editingPreset?.main?.[0] || '');
  const [jailbreak, setJailbreak] = useState(editingPreset?.jailbreak?.[0] || '');
  const [authorsNote, setAuthorsNote] = useState(editingPreset?.authorsNote?.[0] || '');

  const handleSave = () => {
    if (!name.trim()) return;
    Keyboard.dismiss();
    const newPreset: Preset = {
      id: editingPreset?.id || Date.now().toString(),
      name: name.trim(),
      sceneMode: presetMode === 'online' ? 'online' : 'offline',
      sceneDescription: sceneDescription.trim(),
      main: [main.trim()],
      jailbreak: [jailbreak.trim()],
      authorsNote: [authorsNote.trim()],
      authorsNoteDepth: editingPreset?.authorsNoteDepth ?? 0,
    };
    const isOnline = presetMode === 'online';
    const list = isOnline ? onlinePresets : offlinePresets;
    if (editingPreset?.id) {
      set(isOnline
        ? { onlinePresets: list.map(preset => preset.id === newPreset.id ? newPreset : preset) }
        : { offlinePresets: list.map(preset => preset.id === newPreset.id ? newPreset : preset) });
    } else {
      set(isOnline
        ? { onlinePresets: [...list, newPreset] }
        : { offlinePresets: [...list, newPreset] });
    }
    set({ editingPreset: null, presetView: 'list' });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 36 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <PresetField label={(t as any).name} value={name} onChangeText={setName} placeholder={t.presetName} />
      <NeumorphicSurface
        depth="raisedSmall"
        tone="lavender"
        radius={16}
        fill={false}
        style={{ marginBottom: 16 }}
        contentStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 16, fontWeight: '600', marginBottom: 4 }}>{t.sceneMode}</Text>
        <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>
          {presetMode === 'online' ? t.onlinePresets : t.offlinePresets}
        </Text>
      </NeumorphicSurface>
      <PresetField label={t.sceneDescription} value={sceneDescription} onChangeText={setSceneDescription} placeholder={t.sceneDescription} multiline />
      <PresetField label={(t as any).mainPrompt} value={main} onChangeText={setMain} placeholder={t.mainPrompt} multiline />
      <PresetField label={(t as any).jailbreakPrompt} value={jailbreak} onChangeText={setJailbreak} placeholder={t.jailbreakPrompt} multiline />
      <PresetField label={(t as any).authorsNote} value={authorsNote} onChangeText={setAuthorsNote} placeholder={t.authorsNote} multiline />
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={t.savePreset} onPress={handleSave} style={{ minHeight: 54, borderRadius: 18, marginBottom: 30 }}>
        <NeumorphicSurface
          pointerEvents="none"
          depth="raised"
          tone="pinkGold"
          radius={18}
          style={{ position: 'absolute', inset: 0 }}
          contentStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}
        >
          <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{t.savePreset}</Text>
        </NeumorphicSurface>
      </AnimatedPressable>
    </ScrollView>
  );
}

export function PresetEditor() {
  const { t } = useApp();
  const presetView = useNanaStore(s => s.presetView);
  const presetMode = useNanaStore(s => s.presetMode);
  const editingPreset = useNanaStore(s => s.editingPreset);
  const onlinePresets = useNanaStore(s => s.onlinePresets);
  const offlinePresets = useNanaStore(s => s.offlinePresets);
  const set = useNanaStore.setState;

  if (presetView !== 'edit') return null;

  const handleDelete = () => {
    if (!editingPreset) return;
    Keyboard.dismiss();
    const isOnline = presetMode === 'online';
    set({
      [isOnline ? 'onlinePresets' : 'offlinePresets']: (isOnline ? onlinePresets : offlinePresets).filter(preset => preset.id !== editingPreset.id),
      editingPreset: null,
      presetView: 'list',
    });
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {editingPreset?.id ? (
        <View style={{ flexShrink: 0, paddingHorizontal: 3, paddingBottom: 12, alignItems: 'flex-end' }}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t.delete}
            onPress={handleDelete}
            style={{ height: 42, minWidth: 92, borderRadius: 21 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="berry"
              radius={21}
              style={{ position: 'absolute', inset: 0 }}
              contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 }}
            >
              <Trash2 size={16} color={neumorphicPalette.onBerry} />
              <Text style={{ color: neumorphicPalette.onBerry, fontSize: 12, fontWeight: '800' }}>{t.delete}</Text>
            </NeumorphicSurface>
          </AnimatedPressable>
        </View>
      ) : null}
      <PresetEditorForm key={editingPreset?.id || 'new'} editingPreset={editingPreset} />
    </View>
  );
}
