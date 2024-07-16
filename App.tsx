import React, {useEffect, useRef, useCallback} from 'react';
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Linking,
  Vibration,
} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import HapticFeedback from 'react-native-haptic-feedback';
import messaging from '@react-native-firebase/messaging';
import NetInfo from '@react-native-community/netinfo';
import SplashScreen from 'react-native-splash-screen';
import {getDeviceId, getModel, getUniqueId} from 'react-native-device-info';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';

type Nullable<TData> = TData | null;

const uri = 'https://studyabout.herokuapp.com/login';

async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
  }
}

function App(): React.JSX.Element {
  const webviewRef = useRef<Nullable<WebView>>(null);
  const onGetMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'getDeviceInfo':
          const deviceId =
            Platform.OS === 'android' ? getModel() : getDeviceId(); // https://gist.github.com/adamawolf/3048717
          const uniqueId = getUniqueId();
          const fcmToken = await messaging().getToken();
          console.log(deviceId, uniqueId, fcmToken);
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
      console.warn('Error in receiving data');
    }
  }, []);
  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    if (request.url.includes('pf.kakao.com')) {
      Linking.openURL(request.url);
      return false;
    }
    return true;
  };

  useEffect(() => {
    requestUserPermission();

    NetInfo.fetch().then(state => {
      if (!state.isConnected) {
        console.log("user's internet is offline");
      }
    });

    setTimeout(() => {
      SplashScreen.hide();
    }, 1000);
  }, []);

  return (
    <SafeAreaView style={styles.safeAreaView}>
      <WebView
        source={{uri}}
        bounces={false}
        ref={webviewRef}
        webviewDebuggingEnabled
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onGetMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaView: {
    flex: 1,
  },
});

export default App;
