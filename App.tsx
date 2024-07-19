import React, {useEffect, useRef, useCallback} from 'react';
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Linking,
  Vibration,
} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import firebase from '@react-native-firebase/app';
import HapticFeedback from 'react-native-haptic-feedback';
import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import NetInfo from '@react-native-community/netinfo';
import SplashScreen from 'react-native-splash-screen';
import {getDeviceId, getModel, getUniqueId} from 'react-native-device-info';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';
import {firebaseConfig} from './config';

type Nullable<TData> = TData | null;

const agentSelector = 'about_club_app';
const pushNotificationAllSelector = 'about_club_app_push_notification_all';
const uri = 'https://studyabout.herokuapp.com';

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

PushNotification.configure({
  onRegister: function (token) {
    console.log('TOKEN:', token);
  },

  onNotification: function (notification) {
    if (notification.userInteraction) {
      console.log('notification:', notification);
    }

    notification.finish(PushNotificationIOS.FetchResult.NoData);
  },

  onRegistrationError: function (err: Error) {
    console.error(err.message, err);
  },

  permissions: {
    alert: true,
    badge: true,
    sound: true,
  },
  popInitialNotification: true,
  requestPermissions: false,
});
PushNotification.createChannel(
  {
    channelId: pushNotificationAllSelector,
    channelName: '앱 전반',
    channelDescription: '앱 실행하는 알림',
    soundName: 'default',
    importance: 4,
    vibrate: true,
  },
  (created: boolean) =>
    console.log(
      `createChannel ${pushNotificationAllSelector} returned '${created}'`,
    ),
);

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
        userAgent={agentSelector}
        webviewDebuggingEnabled={true}
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
