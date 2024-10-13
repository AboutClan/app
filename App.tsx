import React, {useEffect, useCallback, useRef, useMemo} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Linking,
  // Platform,
  Vibration,
} from 'react-native';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';

import SplashScreen from 'react-native-splash-screen';

import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import type {ReactNativeFirebase} from '@react-native-firebase/app';
import PushNotification, {Importance} from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

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

const firebaseConfig = {
  apiKey: 'AIzaSyBYFfGRL7IGfGCJCX8eQeZlVxankigGsQA',
  authDomain: 'about-db519.firebaseapp.com',
  projectId: 'about-db519',
  storageBucket: 'about-db519.appspot.com',
  messagingSenderId: '116979215697',
  appId: '1:116979215697:web:00de4dd16d0f84b76ef770',
  measurementId: 'G-LPZ00B1RLW',
} as ReactNativeFirebase.FirebaseAppOptions;

const appConfig = {
  uri: 'https://about-aboutclub20s-projects.vercel.app',
  agentSelector: 'about_club_app',
  pushNotificationSelector: 'about_club_app_push_notification_all',
};

const findDeviceInfo = async () => {
  if (!messaging().isDeviceRegisteredForRemoteMessages) {
    await messaging().registerDeviceForRemoteMessages();
  }
  // const deviceId = Platform.OS === 'android' ? getModel() : getDeviceId();
  const deviceId = 'hi';
  const fcmToken = await messaging().getToken();
  return {deviceId, fcmToken};
};

const receiveDeviceInfoToWebview = async (
  webviewRef: React.RefObject<Nullable<WebView>>,
) => {
  const deviceInfo = await findDeviceInfo();
  webviewRef.current?.postMessage(
    JSON.stringify({
      name: 'deviceInfo',
      ...deviceInfo,
    }),
  );
};

const configurePushNotifications = () => {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
  });

  PushNotification.configure({
    onRegister: token => {
      console.log('TOKEN:', token);
    },
    onNotification: notification => {
      if (notification.userInteraction) {
        console.log('notification:', notification);
      }
      notification.finish(PushNotificationIOS.FetchResult.NoData);
    },
    onRegistrationError: (err: Error) => {
      console.error('Push notification registration error:', err);
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
      channelId: appConfig.pushNotificationSelector,
      channelName: '앱 전반',
      channelDescription: '앱 실행하는 알림',
      soundName: 'default',
      importance: Importance.HIGH,
      vibrate: true,
    },
    (created: boolean) => {
      console.log(
        `createChannel ${appConfig.pushNotificationSelector} returned '${created}'`,
      );
    },
  );
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

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
      getDeviceInfo: () => receiveDeviceInfoToWebview(webviewRef),
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
    configurePushNotifications();

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
