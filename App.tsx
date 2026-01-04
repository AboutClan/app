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

import Share from 'react-native-share';
import NetInfo from '@react-native-community/netinfo';
import SplashScreen from 'react-native-splash-screen';
import HapticFeedback from 'react-native-haptic-feedback';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';

import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import type {ReactNativeFirebase} from '@react-native-firebase/app';
import PushNotification, {Importance} from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

import {getModel, getDeviceId} from 'react-native-device-info';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  checkNotifications,
  requestNotifications,
} from 'react-native-permissions';

type Nullable<TData> = TData | null;
interface MessageData {
  type: string;
  link?: string;
  number?: string;
}

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
  splashScreenDelay: 2000,
  haptic: {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: false,
  },
};

const shouldAllowGesture = (url: string): boolean => {
  if (!url) {
    return true;
  }

  const urlFirst = url?.split('?')[0];
  if (urlFirst === 'https://study-about.club/home') {
    return false;
  }

  if (urlFirst === 'https://study-about.club/studyPage') {
    return false;
  }

  if (urlFirst === 'https://study-about.club/gather') {
    return false;
  }

  if (urlFirst === 'https://study-about.club/group') {
    return false;
  }

  if (urlFirst === 'https://study-about.club/user') {
    return false;
  }

  return true;
};

const checkNotificationPermission = async () => {
  if (Platform.OS === 'ios') {
    const resultForIOS = await messaging().hasPermission();
    return resultForIOS;
  } else {
    const {status} = await checkNotifications();
    return status;
  }
};

const requestNotificationPermission = async () => {
  if (Platform.OS === 'ios') {
    const resultForIOS = await messaging().requestPermission();
    return resultForIOS;
  } else {
    const {status} = await requestNotifications(['alert', 'sound', 'badge']);
    return status;
  }
};

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

PushNotification.configure({
  onRegister: token => {
    console.log('TOKEN:', token);
  },
  onNotification: notification => {
    console.log('NOTIFICATION:', notification);
    if (notification.message || notification.data.message) {
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
  requestPermissions: false,
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
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const pendingDeepLinkRef = useRef<string | null>(null);

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

  const sendDeepLinkToWebView = useCallback((url: string) => {
    console.log('📱 Deep link received:', url);

    try {
      // about20s://group/110?param=value 형식 파싱
      // URL API의 host가 React Native에서 제대로 동작하지 않으므로 regex 사용
      const match = url.match(/^about20s:\/\/(.+?)(\?.*)?$/);
      
      if (!match) {
        console.error('Invalid deep link format:', url);
        return;
      }

      const pathAndQuery = match[1]; // "group/110"
      const queryString = match[2] || ''; // "?param=value" or ""
      
      const path = '/' + pathAndQuery;
      
      // Query parameters 파싱
      const params: Record<string, string> = {};
      if (queryString) {
        const searchParams = new URLSearchParams(queryString);
        searchParams.forEach((value, key) => {
          params[key] = value;
        });
      }

      console.log('📱 Parsed path:', path);
      console.log('📱 Parsed params:', params);

      const message = JSON.stringify({
        name: 'deeplink',
        path,
        params,
      });

      console.log('📱 Sending message to webview:', message);
      webviewRef.current?.postMessage(message);
    } catch (err) {
      console.error('Deep link parsing error:', err);
    }
  }, []);

  const handleDeepLink = useCallback((url: string) => {
    if (isWebViewReady) {
      console.log('📱 WebView is ready, processing deep link immediately');
      sendDeepLinkToWebView(url);
    } else {
      console.log('📱 WebView not ready, queuing deep link:', url);
      pendingDeepLinkRef.current = url;
    }
  }, [isWebViewReady, sendDeepLinkToWebView]);

  // 웹뷰에서 메시지를 받았을 때 (웹뷰가 준비되었다는 신호)
  useEffect(() => {
    if (isWebViewReady && pendingDeepLinkRef.current) {
      console.log('📱 WebView ready! Processing pending deep link:', pendingDeepLinkRef.current);
      sendDeepLinkToWebView(pendingDeepLinkRef.current);
      pendingDeepLinkRef.current = null;
    }
  }, [isWebViewReady, sendDeepLinkToWebView]);

  // 앱이 처음 실행될 때, 또는 실행 중 링크 열릴 때
  useEffect(() => {
    console.log('🔧 Setting up deep link listeners...');
    
    const getInitial = async () => {
      const url = await Linking.getInitialURL();
      console.log('🔧 Initial URL:', url || 'null');
      if (url) {
        handleDeepLink(url);
      }
    };
    getInitial();

    console.log('🔧 Adding URL event listener...');
    const sub = Linking.addEventListener('url', ({url}) => {
      console.log('🔧 URL event received:', url);
      handleDeepLink(url);
    });

    return () => {
      console.log('🔧 Removing URL event listener...');
      sub.remove();
    };
  }, [handleDeepLink]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const {url, loading} = navState;

    if (!loading) {
      const shouldAllow = shouldAllowGesture(url);
      setGestureEnabled(shouldAllow);

      console.log(`URL: ${url}`);
      console.log(`Gesture: ${shouldAllow ? 'ENABLED' : 'DISABLED'}`);
    }
  };

  const handleFcmToken = async () => {
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
        platform: Platform.OS,
      }),
    );
  };

  const handleCheckPermission = async () => {
    const authStatus = await checkNotificationPermission();
    const enabled =
      Platform.OS === 'android'
        ? authStatus === RESULTS.GRANTED
        : authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      await handleFcmToken();
    } else {
      const newAuthStatus = await requestNotificationPermission();
      const newEnabled =
        Platform.OS === 'android'
          ? newAuthStatus === RESULTS.GRANTED
          : newAuthStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            newAuthStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (newEnabled) {
        await handleFcmToken();
      }
    }
  };

  const messageHandlers = useMemo(
    () => ({
      share: ({link}: MessageData) => link && handleShare(link),
      callPhone: ({number}: MessageData) =>
        number && Linking.openURL(`tel:${number}`),
      sendTextMessage: ({number}: MessageData) =>
        number && Linking.openURL(`sms:${number}`),
      vibrate: () => Vibration.vibrate(),
      haptic: () => HapticFeedback.trigger('impactLight', appConfig.haptic),
      getDeviceInfo: handleFcmToken,
      openExternalLink: ({link}: MessageData) => link && Linking.openURL(link),
      exitApp: () => BackHandler.exitApp(),
      webviewReady: () => {
        console.log('📱 WebView is ready!');
        setIsWebViewReady(true);
      },
    }),
    [],
  );

  const onGetMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data: MessageData = JSON.parse(event.nativeEvent.data);
        console.log('data:', data);
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
      if (request.url.includes('youtube.com/watch')) {
        Linking.openURL(request.url)
          .then(() => {})
          .catch(error => console.log(error));
        return false;
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    handleCheckPermission();

    BackHandler.addEventListener('hardwareBackPress', backAction);

    return () =>
      BackHandler.removeEventListener('hardwareBackPress', backAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      allowsBackForwardNavigationGestures={gestureEnabled}
      onNavigationStateChange={handleNavigationStateChange}
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
    const splashTimer = setTimeout(() => {
      SplashScreen.hide();
    }, appConfig.splashScreenDelay);

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
    backgroundColor: 'white',
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
