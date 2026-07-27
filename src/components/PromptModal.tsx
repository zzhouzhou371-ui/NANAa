import { useState } from 'react';
import { View, Text, TextInput, useWindowDimensions } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { AnimatedPressable, GradientButton } from './primitives';
import type { PromptModalState } from '../types';
import { crystalGlass, palette } from '../constants/design';

function PromptModalContent({
  promptModal,
  savedAvatars,
}: {
  promptModal: PromptModalState;
  savedAvatars: string[];
}) {
  const { t } = useApp();
  const set = useNanaStore.setState;
  const [inputValue, setInputValue] = useState(promptModal.value || '');
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 48, 360);

  const handleSave = () => {
    promptModal.onSave?.(inputValue);
    set({ promptModal: { isOpen: false, title: '', value: '', onSave: () => {} } });
    setInputValue('');
  };

  const handleCancel = () => {
    set({ promptModal: { isOpen: false, title: '', value: '', onSave: () => {} } });
    setInputValue('');
  };

  return (
    <View className="absolute inset-0 z-50 justify-center items-center px-6" style={{ backgroundColor: 'rgba(17,24,45,0.52)' }}>
        <View style={{ width: cardWidth, backgroundColor: palette.surface, borderRadius: 22, padding: 22, borderWidth: 0.75, borderColor: 'rgba(255,255,255,0.52)' }}>
          <Text style={{ color: palette.ink, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' }}>{promptModal.title}</Text>

          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            inputMode={promptModal.inputMode || (promptModal.showSavedAvatars ? 'text' : 'numeric')}
            placeholder="Enter count..."
            placeholderTextColor={palette.inkSoft}
            style={{ width: '100%', minHeight: 46, backgroundColor: palette.surfaceMuted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: palette.ink, marginBottom: 16, borderWidth: 0.75, borderColor: crystalGlass.edge }}
          />

          {promptModal.showSavedAvatars && savedAvatars.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-4 justify-center">
              {savedAvatars.slice(0, 12).map((a, i) => (
                <AnimatedPressable
                  key={i}
                  onPress={() => setInputValue(inputValue + a)}
                  style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted }}
                >
                  <Text className="text-lg">{a}</Text>
                </AnimatedPressable>
              ))}
            </View>
          )}

          <View className="flex-row gap-3">
            <AnimatedPressable onPress={handleCancel} style={{ flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted }}>
              <Text style={{ color: palette.ink, fontWeight: '800' }}>{t.cancel}</Text>
            </AnimatedPressable>
            <GradientButton variant="primary" borderRadius={9999} onPress={handleSave} style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontWeight: '800' }}>{t.save}</Text>
            </GradientButton>
          </View>
        </View>
      </View>
  );
}

export function PromptModal() {
  const promptModal = useNanaStore(s => s.promptModal);
  const savedAvatars = useNanaStore(s => s.savedAvatars);

  if (!promptModal.isOpen) return null;

  return (
    <PromptModalContent
      key={`${promptModal.title}:${promptModal.value}`}
      promptModal={promptModal}
      savedAvatars={savedAvatars}
    />
  );
}
