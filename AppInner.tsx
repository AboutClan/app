import React, {useCallback, useRef, useMemo} from 'react';
import {Linking, Vibration, SafeAreaView, StyleSheet} from 'react-native';
import HapticFeedback from 'react-native-haptic-feedback';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';
import {uri, agentSelector} from './src/constants/app';
import {handleShare} from './src/libs/handleShare';
import {Nullable} from './src/typing';
import {getDeviceInfoAndPostToWeb} from './src/libs/getDeviceInfo';

interface MessageData {
  type: string;
  link?: string;
  number?: string;
}

const HAPTIC_OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

const AppInner: React.FC = () => {
  const webviewRef = useRef<Nullable<WebView>>(null);

  const messageHandlers = useMemo(
    () => ({
      share: ({link}: MessageData) => link && handleShare(link),
      callPhone: ({number}: MessageData) =>
        number && Linking.openURL(`tel:${number}`),
      sendTextMessage: ({number}: MessageData) =>
        number && Linking.openURL(`sms:${number}`),
      vibrate: () => Vibration.vibrate(),
      haptic: () => HapticFeedback.trigger('impactLight', HAPTIC_OPTIONS),
      getDeviceInfo: () => getDeviceInfoAndPostToWeb(webviewRef),
      openExternalLink: ({link}: MessageData) => link && Linking.openURL(link),
    }),
    [],
  );

  const onGetMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data: MessageData = JSON.parse(event.nativeEvent.data);
        const handler =
          messageHandlers[data.type as keyof typeof messageHandlers];
        handler?.(data);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    },
    [messageHandlers],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      if (request.url.includes('open.kakao.com')) {
        Linking.openURL(request.url);
        return false;
      }
      return true;
    },
    [],
  );

  return (
    <SafeAreaView style={styles.safeAreaView}>
      <WebView
        source={{uri}}
        bounces={false}
        hideKeyboardAccessoryView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onGetMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        webviewDebuggingEnabled={__DEV__}
        ref={webviewRef}
        userAgent={agentSelector}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeAreaView: {
    flex: 1,
    backgroundColor: '#141517',
  },
});

export default AppInner;
