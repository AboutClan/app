import {Platform} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {getModel, getDeviceId} from 'react-native-device-info';
import {WebView} from 'react-native-webview';
import {Nullable} from '../typing';

const getDeviceInfo = async () => {
  if (!messaging().isDeviceRegisteredForRemoteMessages) {
    await messaging().registerDeviceForRemoteMessages();
  }
  const platform = Platform.OS === 'android' ? getModel() : getDeviceId();
  const fcmToken = await messaging().getToken();
  return {platform, fcmToken};
};

export const getDeviceInfoAndPostToWeb = async (
  webviewRef: React.RefObject<Nullable<WebView>>,
) => {
  const deviceInfo = await getDeviceInfo();
  webviewRef.current?.postMessage(
    JSON.stringify({
      name: 'deviceInfo',
      ...deviceInfo,
    }),
  );
};
