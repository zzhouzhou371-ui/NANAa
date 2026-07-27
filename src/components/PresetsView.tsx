import { View } from 'react-native';
import { PresetList } from './PresetList';
import { PresetEditor } from './PresetEditor';

export function PresetsView() {
  return (
    <View className="flex-1">
      <PresetList />
      <PresetEditor />
    </View>
  );
}
