// App.tsx (RN 0.77.x)
// ✅ 목표: “가장 안정적(특히 Android)” + “접속 시 업데이트 유도(강제 가능)”
// - Android: OS(FCM notification payload)로 알림 표시, 앱은 "클릭 처리"만 담당
// - iOS: (원하면) foreground에서만 localNotification으로 보강 가능
//
// ✅ 포함 기능
// - WebView + deepLink(postMessage) + backAction + webviewReady
// - FCM 클릭 처리: onNotificationOpenedApp / getInitialNotification
// - Android에서 localNotification 생성 제거(중복 방지)
// - (추가) 앱 시작 시 버전 체크 → 스토어 이동(강제 업데이트: 커스텀 Modal)
//
// ⚠️ 전제
// - 서버 payload에 android.notification 포함(OS 알림 1회 표시)

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import NetInfo from '@react-native-community/netinfo';
import HapticFeedback from 'react-native-haptic-feedback';
import Share from 'react-native-share';
import SplashScreen from 'react-native-splash-screen';

import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';

import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type {ReactNativeFirebase} from '@react-native-firebase/app';
import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import PushNotification, {Importance} from 'react-native-push-notification';

import DeviceInfo, {getDeviceId, getModel} from 'react-native-device-info';
import {
  checkNotifications,
  requestNotifications,
  RESULTS,
} from 'react-native-permissions';

/* ===========================
   [UPDATE] Force Update Config
=========================== */
// ✅ 너가 바꿀 값
const FORCE_UPDATE_VERSION_ANDROID = '999.0.0'; // [EDIT ME]
const FORCE_UPDATE_VERSION_IOS = '999.0.0'; // [EDIT ME]

// Android
const ANDROID_STORE_URL = 'market://details?id=com.about.studyaboutclubapp';
const ANDROID_STORE_WEB_URL =
  'https://play.google.com/store/apps/details?id=com.about.studyaboutclubapp';

// iOS
const IOS_STORE_URL =
  'https://apps.apple.com/kr/app/%EC%96%B4%EB%B0%94%EC%9B%83/id6737145787';

const compareSemver = (a: string, b: string) => {
  // returns -1 if a < b, 0 if equal, 1 if a > b
  const pa = String(a || '')
    .split('.')
    .map(s => parseInt(s, 10));
  const pb = String(b || '')
    .split('.')
    .map(s => parseInt(s, 10));

  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
};

const openStore = async () => {
  try {
    if (Platform.OS === 'android') {
      const canOpen = await Linking.canOpenURL(ANDROID_STORE_URL);
      await Linking.openURL(
        canOpen ? ANDROID_STORE_URL : ANDROID_STORE_WEB_URL,
      );
      return;
    }
    await Linking.openURL(IOS_STORE_URL);
  } catch (e) {
    console.error('openStore error:', e);
  }
};

/* ===========================
   Dedupe (Global)
=========================== */
const NOTI_DEDUPE_TTL_MS = 15000;
const seenNotiKeys = new Map<string, number>();

const shouldDropDuplicate = (key: string) => {
  const now = Date.now();
  const last = seenNotiKeys.get(key);

  if (seenNotiKeys.size > 200) {
    for (const [k, t] of seenNotiKeys.entries()) {
      if (now - t > NOTI_DEDUPE_TTL_MS) seenNotiKeys.delete(k);
    }
  }

  if (last && now - last < NOTI_DEDUPE_TTL_MS) return true;
  seenNotiKeys.set(key, now);
  return false;
};

const buildNotiKey = (rm: any) => {
  const mid = rm?.messageId ?? rm?.data?.messageId ?? rm?.data?.id;
  if (mid) return `mid:${String(mid)}`;

  const title = String(rm?.data?.title ?? '');
  const body = String(rm?.data?.body ?? '');
  const deeplink = String(rm?.data?.deeplink ?? '');
  return `sig:${title}|${body}|${deeplink}`;
};

/* ===========================
   Global refs/flags (중요)
=========================== */
const handleDeepLinkRef: {current: (url: string) => void} = {
  current: () => {},
};

let isDeepLinkHandlerReady = false;
let pendingPushDeeplink: string | null = null;

/* ===========================
   Config
=========================== */
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

/* ===========================
   Helpers
=========================== */
const shouldAllowGesture = (url: string): boolean => {
  if (!url) return true;

  const urlFirst = url.split('?')[0];

  if (urlFirst === 'https://study-about.club/home') return false;
  if (urlFirst === 'https://study-about.club/studyPage') return false;
  if (urlFirst === 'https://study-about.club/gather') return false;
  if (urlFirst === 'https://study-about.club/group') return false;
  if (urlFirst === 'https://study-about.club/user') return false;

  return true;
};

const normalizeDeeplink = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const unquoted = s.replace(/^['"]+|['"]+$/g, '');

  if (unquoted.startsWith('/')) return `about20s://${unquoted.slice(1)}`;
  if (unquoted.startsWith('about20s://')) return unquoted;

  if (!unquoted.includes('://'))
    return `about20s://${unquoted.replace(/^\/+/, '')}`;

  return unquoted;
};

const checkNotificationPermission = async () => {
  if (Platform.OS === 'ios') {
    // @ts-ignore
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

const handleShare = async (link: string) => {
  try {
    await Share.open({url: link});
  } catch (err) {
    console.error('Error sharing:', err);
  }
};

/* ===========================
   Firebase Init (Global)
=========================== */
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

/* ===========================
   Push Channel (Global)
=========================== */
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

/* ===========================
   Background FCM (Global)
   - Android: OS 알림만 사용 → localNotification 금지(중복 방지)
   - iOS: 원하면 data-only일 때만 localNotification 사용 가능
=========================== */
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    if (Platform.OS === 'android') return;

    const key = buildNotiKey(remoteMessage);
    if (shouldDropDuplicate(key)) return;

    const data = remoteMessage?.data ?? {};
    const title = String(data.title ?? '');
    const message = String(data.body ?? '');
    const deeplink = normalizeDeeplink(data.deeplink);
    const channelId = String(
      data.channelId ?? appConfig.pushNotificationSelector,
    );

    if (!title || !message) return;

    PushNotification.localNotification({
      channelId,
      title,
      message,
      userInfo: {deeplink},
      playSound: true,
      soundName: 'default',
    });
  } catch (e) {
    console.error('Background message handler error:', e);
  }
});

/* ===========================
   Push Configure (Global)
   - localNotification 클릭 경로
=========================== */
PushNotification.configure({
  onRegister: token => {
    console.log('TOKEN:', token);
  },

  onNotification: notification => {
    // ✅ Android에서는 OS 알림 클릭을 messaging().onNotificationOpenedApp / getInitialNotification로 처리
    if (Platform.OS === 'android') {
      notification.finish(PushNotificationIOS.FetchResult.NoData);
      return;
    }

    const deeplinkRaw =
      (notification as any)?.userInfo?.deeplink ||
      (notification as any)?.data?.deeplink;

    const deeplink = normalizeDeeplink(deeplinkRaw);
    if (deeplink) {
      if (isDeepLinkHandlerReady) {
        handleDeepLinkRef.current(String(deeplink));
      } else {
        pendingPushDeeplink = String(deeplink);
      }
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

/* ===========================
   Network Hook
=========================== */
const useNetworkStatus = () => {
  const [isOffline, setIsOffline] = useState(false);

  const checkNetworkStatus = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);
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

/* ===========================
   Types
=========================== */
type Nullable<T> = T | null;

interface MessageData {
  type: string;
  link?: string;
  number?: string;
}

/* ===========================
   [ADD] Pretty Force Update Modal
=========================== */
function ForceUpdateModal({
  visible,
  onUpdate,
}: {
  visible: boolean;
  onUpdate: () => void;
}) {
  // Android 뒤로가기 막기(강제)
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}>
      <View style={stylesUpdate.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

        <View style={stylesUpdate.card}>
          <Text style={stylesUpdate.title}>새로운 버전 업데이트</Text>

          <Text style={stylesUpdate.desc}>
            더 안정적이고 편리해진 서비스를 이용하기 위해{'\n'}최신 버전으로
            업데이트가 필요합니다.
          </Text>

          {/* --- 추가된 업데이트 상세 내역 --- */}
          <View style={stylesUpdate.infoBox}>
            <Text style={stylesUpdate.infoTitle}>주요 업데이트 내용</Text>

            <View style={stylesUpdate.infoItem}>
              <Text style={stylesUpdate.bullet}>•</Text>
              <Text style={stylesUpdate.infoText}>
                알림(푸시) 클릭 시 해당 페이지로 바로 이동
              </Text>
            </View>

            <View style={stylesUpdate.infoItem}>
              <Text style={stylesUpdate.bullet}>•</Text>
              <Text style={stylesUpdate.infoText}>
                앱 디자인 및 사용자 편의성 대폭 개선
              </Text>
            </View>
          </View>
          {/* --------------------------- */}

          <Pressable style={stylesUpdate.button} onPress={onUpdate}>
            <Text style={stylesUpdate.buttonText}>업데이트 하러가기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ===========================
   Section (WebView wrapper)
=========================== */
function Section({
  onForceUpdateRequired,
}: {
  onForceUpdateRequired: (required: boolean) => void;
}): JSX.Element {
  const webviewRef = useRef<Nullable<WebView>>(null);
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [isWebViewReady, setIsWebViewReady] = useState(false);

  const pendingDeepLinkRef = useRef<string | null>(null);

  const backAction = useCallback(() => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(
        JSON.stringify({
          name: 'backAction',
        }),
      );
      return true;
    }
    return false;
  }, []);

  const sendDeepLinkToWebView = useCallback((url: string) => {
    try {
      const match = url.match(/^about20s:\/\/(.+?)(\?.*)?$/);
      if (!match) return;

      const pathAndQuery = match[1];
      const queryString = match[2] || '';
      const path = '/' + pathAndQuery;

      const params: Record<string, string> = {};
      if (queryString) {
        const sp = new URLSearchParams(queryString);
        sp.forEach((value, key) => {
          params[key] = value;
        });
      }

      webviewRef.current?.postMessage(
        JSON.stringify({
          name: 'deeplink',
          path,
          params,
        }),
      );
    } catch (err) {
      console.error('Deep link parsing error:', err);
    }
  }, []);

  const handleDeepLink = useCallback(
    (url: string) => {
      if (isWebViewReady) {
        sendDeepLinkToWebView(url);
      } else {
        pendingDeepLinkRef.current = url;
      }
    },
    [isWebViewReady, sendDeepLinkToWebView],
  );

  useEffect(() => {
    handleDeepLinkRef.current = handleDeepLink;
    isDeepLinkHandlerReady = true;

    if (pendingPushDeeplink) {
      handleDeepLink(pendingPushDeeplink);
      pendingPushDeeplink = null;
    }
  }, [handleDeepLink]);

  useEffect(() => {
    if (isWebViewReady && pendingDeepLinkRef.current) {
      sendDeepLinkToWebView(pendingDeepLinkRef.current);
      pendingDeepLinkRef.current = null;
    }
  }, [isWebViewReady, sendDeepLinkToWebView]);

  useEffect(() => {
    const getInitial = async () => {
      const url = await Linking.getInitialURL();
      if (url) handleDeepLink(url);
    };
    getInitial();

    const sub = Linking.addEventListener('url', ({url}) => {
      handleDeepLink(url);
    });

    return () => {
      sub.remove();
    };
  }, [handleDeepLink]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const {url, loading} = navState;

    if (!loading) {
      const shouldAllow = shouldAllowGesture(url);
      setGestureEnabled(shouldAllow);
    }
  };

  const handleFcmToken = useCallback(async () => {
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
  }, []);

  const handleCheckPermission = useCallback(async () => {
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
  }, [handleFcmToken]);

  const messageHandlers = useMemo(
    () => ({
      share: ({link}: MessageData) => link && handleShare(link),
      callPhone: ({number}: MessageData) =>
        number && Linking.openURL(`tel:${number}`),
      sendTextMessage: ({number}: MessageData) =>
        number && Linking.openURL(`sms:${number}`),
      vibrate: () => Vibration.vibrate(),
      haptic: () => HapticFeedback.trigger('impactLight', appConfig.haptic),
      getDeviceInfo: () => handleFcmToken(),
      openExternalLink: ({link}: MessageData) => link && Linking.openURL(link),
      exitApp: () => BackHandler.exitApp(),
      webviewReady: () => {
        setIsWebViewReady(true);
      },
    }),
    [handleFcmToken],
  );

  const onGetMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event?.nativeEvent?.data;
      if (!raw || typeof raw !== 'string' || raw === 'undefined') return;

      let data: MessageData | null = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        console.error('Error processing message (JSON.parse):', error, raw);
        return;
      }

      if (!data?.type) return;

      const handler =
        messageHandlers[data.type as keyof typeof messageHandlers];
      handler?.(data);
    },
    [messageHandlers],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      if (request.url.includes('youtube.com/watch')) {
        Linking.openURL(request.url).catch(error => console.log(error));
        return false;
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    handleCheckPermission();

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove();
  }, [handleCheckPermission, backAction]);

  // ✅ Foreground FCM: Android는 OS 알림이므로 localNotification 만들지 않음
  useEffect(() => {
    const unsub = messaging().onMessage(async remoteMessage => {
      try {
        if (Platform.OS === 'android') return;

        const key = buildNotiKey(remoteMessage);
        if (shouldDropDuplicate(key)) return;

        const data = remoteMessage?.data ?? {};
        const title = (data.title ?? '').toString();
        const message = (data.body ?? '').toString();
        const deeplink = normalizeDeeplink(data.deeplink);
        const channelId = (
          data.channelId ?? appConfig.pushNotificationSelector
        ).toString();

        if (!title || !message) return;

        PushNotification.localNotification({
          channelId,
          title,
          message,
          userInfo: {deeplink},
          playSound: true,
          soundName: 'default',
        });
      } catch (e) {
        console.error('Foreground message handler error:', e);
      }
    });

    return unsub;
  }, []);

  // ✅ FCM 클릭 경로 (Android 핵심)
  useEffect(() => {
    const unsub = messaging().onNotificationOpenedApp(remoteMessage => {
      const deeplink = normalizeDeeplink(remoteMessage?.data?.deeplink);
      if (deeplink) handleDeepLink(String(deeplink));
    });

    return unsub;
  }, [handleDeepLink]);

  useEffect(() => {
    (async () => {
      try {
        const rm = await messaging().getInitialNotification();
        const deeplink = normalizeDeeplink(rm?.data?.deeplink);
        if (deeplink) handleDeepLink(String(deeplink));
      } catch (e) {
        console.error('getInitialNotification error:', e);
      }
    })();
  }, [handleDeepLink]);

  // ✅ [UPDATE] 버전 체크는 "렌더 이후"에 수행 (안정성)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const current = DeviceInfo.getVersion();
        const minRequired =
          Platform.OS === 'android'
            ? FORCE_UPDATE_VERSION_ANDROID
            : FORCE_UPDATE_VERSION_IOS;

        if (!minRequired) return;

        if (compareSemver(current, minRequired) < 0) {
          if (!cancelled) onForceUpdateRequired(true);
        }
      } catch (e) {
        console.error('checkForceUpdate error:', e);
      }
    };

    // WebView 준비 이후 300ms 뒤 체크 (초기 렌더/스플래시 타이밍 충돌 방지)
    if (isWebViewReady) {
      const t = setTimeout(() => void run(), 300);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [isWebViewReady, onForceUpdateRequired]);

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

/* ===========================
   App (root)
=========================== */
function App(): JSX.Element {
  const {isOffline} = useNetworkStatus();
  const [forceUpdateVisible, setForceUpdateVisible] = useState(false);

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
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="white"
        translucent={false}
      />
      <SafeAreaView style={styles.safeAreaView}>
        <Section onForceUpdateRequired={setForceUpdateVisible} />
        <ForceUpdateModal
          visible={forceUpdateVisible}
          onUpdate={() => {
            void openStore();
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
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

const stylesUpdate = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20, // 조금 더 부드럽게 변경
    paddingTop: 16,
    paddingRight: 24,
    paddingLeft: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 16, // 크기 살짝 키움
    fontWeight: '700',
    color: '#424242;',
    marginBottom: 20,
    textAlign: 'center', // 제목 중앙 정렬
  },
  desc: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
  },
  // 업데이트 내역 박스
  infoBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 12,
    color: '#424242',
    marginRight: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#424242',
  },
  button: {
    height: 48, // 터치 영역 확보를 위해 조금 키움
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00c2b3',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false, // 안드로이드 상단 패딩 제거
    textAlignVertical: 'center', // 세로 정렬 명시
    lineHeight: 24, // (선택사항) 텍스트 높이를 명시적으로 지정
    marginBottom: 2,
  },
});

export default App;
