import React, {useCallback, useRef} from 'react';
import {
  Platform,
  Linking,
  Vibration,
  SafeAreaView,
  StyleSheet,
} from 'react-native';

import Share from 'react-native-share';
import messaging from '@react-native-firebase/messaging';

import HapticFeedback from 'react-native-haptic-feedback';
import {getModel, getDeviceId} from 'react-native-device-info';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import {uri, agentSelector} from './src/constants/app';

type Nullable<TData> = TData | null;

const AppInner = () => {
  const webviewRef = useRef<Nullable<WebView>>(null);

  const onGetMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'getDeviceInfo':
          if (!messaging().isDeviceRegisteredForRemoteMessages) {
            await messaging().registerDeviceForRemoteMessages();
          }
          const platform =
            Platform.OS === 'android' ? getModel() : getDeviceId(); // https://gist.github.com/adamawolf/3048717
          const fcmToken = await messaging().getToken();
          webviewRef.current?.postMessage(
            JSON.stringify({
              name: 'deviceInfo',
              fcmToken,
              platform,
            }),
          );
          break;
        case 'share':
          (async () => {
            try {
              await Share.open({
                url: data.link,
              });
            } catch (err) {
              console.log(err);
            }
          })();
          break;
        case 'callPhone':
          Linking.openURL(`tel:${data.number}`);
          break;
        case 'sendTextMessage':
          Linking.openURL(`sms:${data.number}`);
          break;
        case 'openExternalLink':
          Linking.openURL(data.link);
          break;
        case 'haptic':
          HapticFeedback.trigger('impactLight', {
            enableVibrateFallback: true,
            ignoreAndroidSystemSettings: false,
          });
          break;
        case 'vibrate':
          Vibration.vibrate();
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn('error in receiving data');
    }
  }, []);

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
        userAgent={agentSelector}
        webviewDebuggingEnabled={true}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onGetMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        ref={webviewRef}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeAreaView: {
    flex: 1,
  },
});

export default AppInner;
