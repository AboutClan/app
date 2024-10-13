import React, {useEffect, useCallback, useRef, useMemo} from 'react';
import {SafeAreaView, StyleSheet, Linking, Vibration} from 'react-native';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';

import SplashScreen from 'react-native-splash-screen';

type Nullable<TData> = TData | null;
interface MessageData {
  type: string;
  link?: string;
  number?: string;
}

const splashScreenDelay = 1000;

// const hapticConfig = {
//   enableVibrateFallback: true,
//   ignoreAndroidSystemSettings: false,
// };

const appConfig = {
  uri: 'https://about-aboutclub20s-projects.vercel.app',
  agentSelector: 'about_club_app',
  pushNotificationSelector: 'about_club_app_push_notification_all',
};

function Section(): JSX.Element {
  const webviewRef = useRef<Nullable<WebView>>(null);

  const messageHandlers = useMemo(
    () => ({
      // share: ({link}: MessageData) => link && handleShare(link),
      callPhone: ({number}: MessageData) =>
        number && Linking.openURL(`tel:${number}`),
      sendTextMessage: ({number}: MessageData) =>
        number && Linking.openURL(`sms:${number}`),
      vibrate: () => Vibration.vibrate(),
      // haptic: () => HapticFeedback.trigger('impactLight', hapticConfig),
      // getDeviceInfo: () => receiveDeviceInfoToWebview(webviewRef),
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
    <WebView
      ref={webviewRef}
      source={{uri: appConfig.uri}}
      userAgent={appConfig.agentSelector}
      webviewDebuggingEnabled={__DEV__}
      bounces={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      hideKeyboardAccessoryView
      onMessage={onGetMessage}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
    />
  );
}

function App(): JSX.Element {
  // const {isOffline} = useNetworkStatus();

  useEffect(() => {
    // configurePushNotifications();

    const splashTimer = setTimeout(() => {
      SplashScreen.hide();
    }, splashScreenDelay);

    return () => {
      clearTimeout(splashTimer);
    };
  }, []);

  // if (isOffline) {
  //   return <View />;
  // }

  return (
    <SafeAreaView style={styles.safeAreaView}>
      <Section />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
  safeAreaView: {
    flex: 1,
  },
});

export default App;
