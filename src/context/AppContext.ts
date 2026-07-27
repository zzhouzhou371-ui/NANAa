import { createContext, useContext, type ReactNode } from 'react';

export interface AppContextType {
  t: Record<string, string>;
  renderAvatar: (avatar: string | ReactNode) => ReactNode;
  themeFont: string;
  customTextColor: string;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppContext.Provider');
  return ctx;
}

export { AppContext };
