import messaging from '@react-native-firebase/messaging';
import PushNotification, {Importance} from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import {PUSH_NOTIFICATION_SELECTORS} from '../constants/app';

export const configurePushNotifications = () => {
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
      channelId: PUSH_NOTIFICATION_SELECTORS.ALL,
      channelName: '앱 전반',
      channelDescription: '앱 실행하는 알림',
      soundName: 'default',
      importance: Importance.HIGH,
      vibrate: true,
    },
    (created: boolean) => {
      console.log(
        `createChannel ${PUSH_NOTIFICATION_SELECTORS.ALL} returned '${created}'`,
      );
    },
  );
};
