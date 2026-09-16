import { useNanaStore } from '@/stores/nanaStore';
import { getMeetingCopy } from '../meeting-copy';

export const useMeetingCopy = () => useNanaStore(
  state => getMeetingCopy(state.themeConfig.language),
);
