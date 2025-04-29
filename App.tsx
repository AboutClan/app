import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  SafeAreaView,
  StyleSheet,
  Linking,
  Platform,
  Vibration,
  BackHandler,
  ActivityIndicator,
} from 'react-native';

import NetInfo from '@react-native-community/netinfo';
import {getModel, getDeviceId} from 'react-native-device-info';

import Share from 'react-native-share';
import SplashScreen from 'react-native-splash-screen';
import HapticFeedback from 'react-native-haptic-feedback';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes';

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

const splashScreenDelay = 2000;

const hapticConfig = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

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
  uri: 'https://study-about.club/',
  agentSelector: 'about_club_app',
  pushNotificationSelector: 'about_club_app_push_notification_all',
  originWhitelist: ['intent', 'https', 'kakaolink'],
};

const receiveDeviceInfoToWebview = async (
  webviewRef: React.RefObject<Nullable<WebView>>,
) => {
  if (!messaging().isDeviceRegisteredForRemoteMessages) {
    await messaging().registerDeviceForRemoteMessages();
  }
  const fcmToken = await messaging().getToken();
  const deviceId = Platform.OS === 'android' ? getModel() : getDeviceId();

  webviewRef.current?.postMessage(
    JSON.stringify({
      name: 'deviceInfo',
      fcmToken,
      deviceId,
    }),
  );
};

const configurePushNotifications = () => {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
  });

  PushNotification.configure({
    // (optional) 토큰이 생성될 때 실행된다(토큰은 서버에 등록할 때 쓸 수 있음)
    onRegister: token => {
      console.log('TOKEN:', token);
    },
    // (reguired) 리모트 노티를 수신하거나, 열었거나 로컬 노티를 열었을 때 실행
    onNotification: notification => {
      console.log('NOTIFICATION:', notification);
      if (notification.message || notification.data.message) {
        // console.log('notification:', notification);
      }
      notification.finish(PushNotificationIOS.FetchResult.NoData); // For IOS
    },
    onRegistrationError: (err: Error) => {
      console.error('Push notification registration error:', err);
    },
    // IOS ONLY (optional): defaul: all - Permissions to register
    permissions: {
      alert: true,
      badge: true,
      sound: true,
    },
    // 권한 요청
    requestPermissions: false,
    // Should the initial notification be popped automatically
    // default: true
    popInitialNotification: true,
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

const handleShare = async (link: string) => {
  try {
    await Share.open({url: link});
  } catch (err) {
    console.error('Error sharing:', err);
  }
};

const useNetworkStatus = () => {
  const [isOffline, setIsOffline] = useState(false);

  const checkNetworkStatus = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);
      if (!state.isConnected) {
        console.log('User internet is offline');
      }
    } catch (error) {
      console.error('Error checking network status:', error);
    }
  }, []);

  useEffect(() => {
    checkNetworkStatus();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });

    return () => {
      unsubscribe();
    };
  }, [checkNetworkStatus]);

  return {isOffline, checkNetworkStatus};
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

function Section(): JSX.Element {
  const webviewRef = useRef<Nullable<WebView>>(null);
  const backAction = () => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(
        JSON.stringify({
          name: 'backAction',
        }),
      );
      return true;
    }
  };

  useEffect(() => {
    BackHandler.addEventListener('hardwareBackPress', backAction);

    return () =>
      BackHandler.removeEventListener('hardwareBackPress', backAction);
  }, []);

  const messageHandlers = useMemo(
    () => ({
      share: ({link}: MessageData) => link && handleShare(link),
      callPhone: ({number}: MessageData) =>
        number && Linking.openURL(`tel:${number}`),
      sendTextMessage: ({number}: MessageData) =>
        number && Linking.openURL(`sms:${number}`),
      vibrate: () => Vibration.vibrate(),
      haptic: () => HapticFeedback.trigger('impactLight', hapticConfig),
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
      if (
        request.url.includes('kakaolink') ||
        request.url.includes('pf.kakao.com') ||
        request.url.includes('open.kakao.com') ||
        request.url.includes('youtube.com/watch')
      ) {
        Linking.openURL(request.url)
          .then(() => {})
          .catch(error => console.log(error));
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
      originWhitelist={appConfig.originWhitelist}
      webviewDebuggingEnabled={__DEV__}
      bounces={false}
      startInLoadingState
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      hideKeyboardAccessoryView
      onMessage={onGetMessage}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onContentProcessDidTerminate={() => webviewRef.current?.reload()}
      renderLoading={() => (
        <View style={styles.loadingIndicator}>
          <ActivityIndicator color={'#d1d1d1'} />
        </View>
      )}
    />
  );
}

function App(): JSX.Element {
  const {isOffline} = useNetworkStatus();

  useEffect(() => {
    configurePushNotifications();

    const splashTimer = setTimeout(() => {
      SplashScreen.hide();
    }, splashScreenDelay);

    return () => {
      clearTimeout(splashTimer);
    };
  }, []);

  if (isOffline) {
    return <View />;
  }

  return (
    <SafeAreaView style={styles.safeAreaView}>
      <Section />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaView: {
    flex: 1,
  },
  loadingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
