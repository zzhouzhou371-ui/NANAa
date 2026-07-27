import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { i18n } from '../i18n';
import { useNanaStore } from '../stores/nanaStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    try {
      void useNanaStore.persist.rehydrate();
    } catch {}
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const t = useNanaStore.getState().themeConfig.language === 'zh' ? i18n.zh : i18n.en;

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          backgroundColor: '#101833',
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            alignItems: 'center',
            borderRadius: 24,
            padding: 28,
            backgroundColor: '#F8F0EB',
          }}
        >
          <Text style={{ color: '#3F4A67', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
            {t.somethingWentWrong}
          </Text>
          <Text
            selectable
            style={{ color: '#63728E', fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: 'center' }}
          >
            {this.state.error?.message || 'Unknown JavaScript runtime error'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.reload}
            onPress={this.handleReload}
            style={({ pressed }) => ({
              minHeight: 44,
              marginTop: 18,
              paddingHorizontal: 22,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? '#E8B8C8' : '#F4C8D7',
            })}
          >
            <Text style={{ color: '#5E5672', fontSize: 14, fontWeight: '800' }}>{t.reload}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}
