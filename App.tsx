// App.tsx (RN 0.77.x)

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
import messaging from '@react-native-firebase/messaging';
import PushNotification, {Importance} from 'react-native-push-notification';

import DeviceInfo, {getDeviceId, getModel} from 'react-native-device-info';
import {
  checkNotifications,
  requestNotifications,
  RESULTS,
} from 'react-native-permissions';

/* ===========================
   Force Update Config
=========================== */
// ✅ 너가 바꿀 값
const FORCE_UPDATE_VERSION_ANDROID = '1.3.15'; // [EDIT ME]
const FORCE_UPDATE_VERSION_IOS = '1.1.2'; // [EDIT ME]

const ANDROID_STORE_URL = 'market://details?id=com.about.studyaboutclubapp';
const ANDROID_STORE_WEB_URL =
  'https://play.google.com/store/apps/details?id=com.about.studyaboutclubapp';

const IOS_STORE_URL =
  'https://apps.apple.com/kr/app/%EC%96%B4%EB%B0%94%EC%9B%83/id6737145787';

const compareSemver = (a: string, b: string) => {
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
const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(String(v).replace(/\+/g, '%20'));
  } catch {
    return String(v);
  }
};

const getQS = (qs: string, key: string) => {
  const m = String(qs).match(new RegExp(`(?:^|&)${key}=([^&]+)`));
  return m?.[1] ?? null;
};
const toAboutSchemeIfKakaoLink = (url: string) => {
  try {
    if (typeof url !== 'string') return '';
    if (!url.includes('kakaolink')) return url;

    const qIndex = url.indexOf('?');
    if (qIndex < 0) return url;

    const qs = url.slice(qIndex + 1);

    // 1) 1차 후보: dl / path
    let target = getQS(qs, 'dl') || getQS(qs, 'path');

    // 2) 없으면 "쿼리 전체를 decode"해서 다시 탐색 (androidExecutionParams 등)
    if (!target) {
      const decodedQS = safeDecode(qs);
      target = getQS(decodedQS, 'dl') || getQS(decodedQS, 'path');
    }

    // 3) 최종 fallback: 강제 정규식
    if (!target) {
      const m = qs.match(/(?:^|&)(?:dl|path)=([^&]+)/);
      if (m?.[1]) target = m[1];
    }

    if (!target) return url;

    const decoded = safeDecode(target).replace(/^\/+/, '');
    if (!decoded) return 'about20s://home';

    return decoded.startsWith('about20s://')
      ? decoded
      : `about20s://${decoded}`;
  } catch {
    return url;
  }
};

const toAboutSchemeIfWebUrl = (url: string) => {
  if (typeof url !== 'string') return '';
  const s = url.trim();
  if (!s.startsWith('https://')) return s;

  const hostOk =
    s === 'https://study-about.club' ||
    s === 'https://www.study-about.club' ||
    s.startsWith('https://study-about.club/') ||
    s.startsWith('https://www.study-about.club/') ||
    s === 'https://about20s.club' ||
    s === 'https://www.about20s.club' ||
    s.startsWith('https://about20s.club/') ||
    s.startsWith('https://www.about20s.club/');

  if (!hostOk) return s;

  // ✅ 핵심: /_open?path=... 이면 목적 path를 꺼내서 about20s://{path} 로 변환
  try {
    const u = new URL(s);
    if (u.pathname === '/_open') {
      const p = u.searchParams.get('dl') || u.searchParams.get('path');
      if (p) {
        const decoded = decodeURIComponent(p).replace(/^\/+/, '');
        return `about20s://${decoded || 'home'}`;
      }
    }
  } catch {}

  const withoutProto = s.replace(
    /^https:\/\/(www\.)?(study-about\.club|about20s\.club)\/?/,
    '',
  );

  return `about20s://${withoutProto}`;
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
   Dedupe (for iOS local noti)
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
   Config
=========================== */
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

const handleShare = async (link: string) => {
  try {
    await Share.open({url: link});
  } catch (err) {
    console.error('Error sharing:', err);
  }
};

const checkNotificationPermission = async () => {
  if (Platform.OS === 'ios') {
    // RNFirebase 버전에 따라 hasPermission 유무가 다를 수 있어 방어
    // @ts-ignore
    if (typeof messaging().hasPermission === 'function') {
      // @ts-ignore
      return await messaging().hasPermission();
    }
    const auth = await messaging().hasPermission?.();
    return auth;
  } else {
    const {status} = await checkNotifications();
    return status;
  }
};

const requestNotificationPermission = async () => {
  if (Platform.OS === 'ios') {
    return await messaging().requestPermission();
  } else {
    const {status} = await requestNotifications(['alert', 'sound', 'badge']);
    return status;
  }
};

/* ===========================
   Network Hook
=========================== */
const useNetworkStatus = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });

    NetInfo.fetch()
      .then(state => setIsOffline(!state.isConnected))
      .catch(() => {});

    return () => unsubscribe();
  }, []);

  return {isOffline};
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
   Force Update Modal
=========================== */
function ForceUpdateModal({
  visible,
  onUpdate,
}: {
  visible: boolean;
  onUpdate: () => void;
}) {
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

  // deeplink queue
  const pendingDeepLinkRef = useRef<string | null>(null);

  // deep link handler (stable)
  const sendDeepLinkToWebView = useCallback((url: string) => {
    console.log('[RN->WV][deeplink][enter]', url); // ✅ 이 줄 추가 (match 전에)
    try {
      // 기존 정규식보다 유연하게 수정: about20s:// 뒤에 슬래시가 몇 개든 상관없이 경로를 캡처합니다.
      // 기존 푸시 알림(about20s://path)도 이 정규식을 100% 통과합니다.
      const match = url.match(/about20s:\/\/?\/?([^?]+)(\?.*)?$/);

      if (!match) return;

      const pathAndQuery = match[1];
      const queryString = match[2] || '';
      const path = '/' + pathAndQuery;

      const params: Record<string, string> = {};

      if (queryString) {
        const qs = queryString.startsWith('?')
          ? queryString.slice(1)
          : queryString;

        try {
          // ✅ RN에서 forEach가 없을 수 있어서 entries()로만 순회
          if (typeof URLSearchParams !== 'undefined') {
            const sp = new URLSearchParams(qs);

            // @ts-ignore: RN polyfill 환경 대응
            for (const [key, value] of sp.entries()) {
              params[String(key)] = String(value);
            }
          } else {
            // fallback
            qs.split('&').forEach(pair => {
              const [k, v] = pair.split('=');
              if (!k) return;
              params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
            });
          }
        } catch (e) {
          // ✅ 혹시 URLSearchParams가 있어도 구현이 이상하면 fallback
          qs.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (!k) return;
            params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
          });
        }
      }

      // ✅ [수정 2] 웹뷰가 메시지를 확실히 처리할 수 있도록 300ms 지연 전송
      // 앱이 꺼져 있다가 켜지는 상황에서 웹뷰 내부 라우터 준비 시간을 벌어줍니다.
      setTimeout(() => {
        console.log('[RN->WV][deeplink]', {url, path, params}); // ✅ 추가
        webviewRef.current?.postMessage(
          JSON.stringify({
            name: 'deeplink',
            path,
            params,
          }),
        );
      }, 300);
    } catch (err) {
      console.error('Deep link parsing error:', err);
    }
  }, []);

  const handleDeepLink = useCallback(
    (incomingUrl: string) => {
      const step1 = toAboutSchemeIfKakaoLink(incomingUrl);
      const step2 = toAboutSchemeIfWebUrl(step1);
      const normalized = normalizeDeeplink(step2);

      console.log('[RN][deeplink][normalized]', {
        incomingUrl,
        step1,
        step2,
        normalized,
        isWebViewReady,
      });

      if (!normalized.startsWith('about20s://')) return;

      if (isWebViewReady) {
        sendDeepLinkToWebView(normalized);
      } else {
        pendingDeepLinkRef.current = normalized;
        console.log('[RN][deeplink][queued]', normalized);
      }
    },
    [isWebViewReady, sendDeepLinkToWebView],
  );

  // useEffect(() => {
  //   if (isWebViewReady && pendingDeepLinkRef.current) {
  //     // 준비 완료 후 즉시 보내지 않고 약간의 텀을 주어 웹뷰 JS가 깨어나길 기다립니다.
  //     const timer = setTimeout(() => {
  //       sendDeepLinkToWebView(pendingDeepLinkRef.current!);
  //       pendingDeepLinkRef.current = null;
  //     }, 500);
  //     return () => clearTimeout(timer);
  //   }
  // }, [isWebViewReady, sendDeepLinkToWebView]);

  const backAction = useCallback(() => {
    if (!webviewRef.current) return false;
    webviewRef.current.postMessage(JSON.stringify({name: 'backAction'}));
    return true;
  }, []);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const {url, loading} = navState;
      if (!loading) setGestureEnabled(shouldAllowGesture(url));
    },
    [],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      if (request.url.includes('youtube.com/watch')) {
        Linking.openURL(request.url).catch(() => {});
        return false;
      }
      return true;
    },
    [],
  );

  const handleFcmToken = useCallback(async () => {
    try {
      if (!messaging().isDeviceRegisteredForRemoteMessages) {
        await messaging().registerDeviceForRemoteMessages();
      }

      const fcmToken = await messaging().getToken();
      const deviceId = Platform.OS === 'android' ? getModel() : getDeviceId();
      const appVersion = DeviceInfo.getVersion();
      const buildNumber = DeviceInfo.getBuildNumber();

      webviewRef.current?.postMessage(
        JSON.stringify({
          name: 'deviceInfo',
          fcmToken,
          deviceId,
          platform: Platform.OS,
          appVersion,
          buildNumber,
        }),
      );
    } catch (e) {
      console.error('handleFcmToken error:', e);
    }
  }, []);

  const handleCheckPermission = useCallback(async () => {
    try {
      const authStatus = await checkNotificationPermission();

      const enabled =
        Platform.OS === 'android'
          ? authStatus === RESULTS.GRANTED
          : authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        await handleFcmToken();
        return;
      }

      const newAuthStatus = await requestNotificationPermission();
      const newEnabled =
        Platform.OS === 'android'
          ? newAuthStatus === RESULTS.GRANTED
          : newAuthStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            newAuthStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (newEnabled) await handleFcmToken();
    } catch (e) {
      console.error('handleCheckPermission error:', e);
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
      getDeviceInfo: () => void handleFcmToken(),
      openExternalLink: ({link}: MessageData) => link && Linking.openURL(link),
      exitApp: () => BackHandler.exitApp(),
      webviewReady: () => {
        console.log('[RN] webviewReady received');
        setIsWebViewReady(true);

        const u = pendingDeepLinkRef.current;
        if (u) {
          pendingDeepLinkRef.current = null;
          sendDeepLinkToWebView(u);
        }
      },
    }),
    [handleFcmToken, sendDeepLinkToWebView],
  );

  const onGetMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event?.nativeEvent?.data;
      if (!raw || typeof raw !== 'string' || raw === 'undefined') return;

      console.log('[WV->RN][raw]', raw); // ✅ 추가

      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        console.error('Error processing message (JSON.parse):', error, raw);
        return;
      }

      const key = data?.type || data?.name; // ✅ 핵심: type 우선, 없으면 name
      if (!key) return;

      console.log('[WV->RN][parsed]', key, data); // ✅ 추가

      const handler = (messageHandlers as any)[key];
      handler?.(data);
    },
    [messageHandlers],
  );

  // 1) Linking deeplink
  useEffect(() => {
    const getInitial = async () => {
      const url = await Linking.getInitialURL();
      console.log('[DEEPLINK][initial]', url);
      if (url) handleDeepLink(url);
    };
    getInitial();

    const sub = Linking.addEventListener('url', ({url}) => {
      console.log('[DEEPLINK][event]', url);
      handleDeepLink(url);
    });
    return () => sub.remove();
  }, [handleDeepLink]);

  // 2) Android back
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );
    return () => backHandler.remove();
  }, [backAction]);

  // 3) permission + token
  useEffect(() => {
    void handleCheckPermission();
  }, [handleCheckPermission]);

  // 4) Foreground FCM → iOS에서만 local noti 보강
  useEffect(() => {
    const unsub = messaging().onMessage(async remoteMessage => {
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
        console.error('Foreground message handler error:', e);
      }
    });

    return unsub;
  }, [handleDeepLink]);

  // 5) Notification click (FCM) → iOS/Android 공통
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

  // 6) Force update (WebView ready 이후)
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
      style={{flex: 1}} // 👈 이 줄을 추가하여 WebView가 공간을 차지하도록 합니다.
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
      onError={syntheticEvent => {
        const {nativeEvent} = syntheticEvent;
        console.warn('WebView error: ', nativeEvent);
      }}
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
export default function App(): JSX.Element {
  const {isOffline} = useNetworkStatus();
  const [forceUpdateVisible, setForceUpdateVisible] = useState(false);

  const didInitRef = useRef(false);

  // ✅ iOS에서 “JS 로딩 전 이벤트 폭주”를 막기 위해, PushNotification 관련 초기화는 여기서 1회만
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    // channel (Android only)
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: appConfig.pushNotificationSelector,
          channelName: '앱 전반',
          channelDescription: '앱 실행하는 알림',
          soundName: 'default',
          importance: Importance.HIGH,
          vibrate: true,
        },
        () => {},
      );
    }

    // local noti click path (iOS only)
    PushNotification.configure({
      onRegister: token => {
        console.log('TOKEN:', token);
      },
      onNotification: notification => {
        if (Platform.OS === 'android') {
          notification.finish(PushNotificationIOS.FetchResult.NoData);
          return;
        }
        notification.finish(PushNotificationIOS.FetchResult.NoData);
      },
      onRegistrationError: (err: Error) => console.error(err),
      permissions: {alert: true, badge: true, sound: true},
      requestPermissions: false,
      popInitialNotification: true,
    });
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      SplashScreen.hide();
    }, appConfig.splashScreenDelay);

    return () => clearTimeout(splashTimer);
  }, []);

  if (isOffline) return <View style={{flex: 1}} />; // 빨간 화면이 나온다면 네트워크 오판입니다.

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="white"
        translucent={false}
      />
      <SafeAreaView
        edges={Platform.OS === 'android' ? ['top'] : ['top']}
        style={styles.safeAreaView}>
        <Section onForceUpdateRequired={setForceUpdateVisible} />
        <ForceUpdateModal
          visible={forceUpdateVisible}
          onUpdate={() => void openStore()}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ===========================
   Styles
=========================== */
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
    borderRadius: 20,
    paddingTop: 16,
    paddingRight: 24,
    paddingLeft: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 20,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
  },
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
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00c2b3',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 24,
    marginBottom: 2,
  },
});
