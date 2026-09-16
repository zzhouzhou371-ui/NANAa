import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MeetingHtmlPanelProps {
  srcDoc: string;
  height: number;
  accessibilityLabel: string;
}
export function MeetingHtmlPanel({ srcDoc, height, accessibilityLabel }: MeetingHtmlPanelProps) {
  const safeHeight = Math.max(44, Math.min(320, Math.round(height)));
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
      style={{ height: safeHeight, overflow: 'hidden' }}
    >
      <WebView
        source={{ html: srcDoc, baseUrl: 'about:blank' }}
        originWhitelist={['about:blank']}
        onShouldStartLoadWithRequest={request => (
          request.url === 'about:blank' || request.url.startsWith('about:blank#')
        )}
        javaScriptEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        incognito
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={{ height: safeHeight, backgroundColor: 'transparent' }}
        containerStyle={{ height: safeHeight, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
