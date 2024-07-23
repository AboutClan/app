import React, {useEffect, useState} from 'react';
import {View} from 'react-native';

import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

import NetInfo from '@react-native-community/netinfo';
import SplashScreen from 'react-native-splash-screen';

import AppInner from './AppInner';
import {firebaseConfig} from './src/constants/firebase';
import {PUSH_NOTIFICATION_SELECTORS} from './src/constants/app';

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
    channelId: PUSH_NOTIFICATION_SELECTORS.ALL,
    channelName: '앱 전반',
    channelDescription: '앱 실행하는 알림',
    soundName: 'default',
    importance: 4,
    vibrate: true,
  },
  (created: boolean) =>
    console.log(
      `createChannel ${PUSH_NOTIFICATION_SELECTORS.ALL} returned '${created}'`,
    ),
);

function App(): React.JSX.Element {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    NetInfo.fetch().then(state => {
      if (!state.isConnected) {
        console.log('user internet is offline');
        setIsOffline(true);
      }
    });

    setTimeout(() => {
      SplashScreen.hide();
    }, 1000);
  }, []);

  if (isOffline) {
    return <View />;
  }

  return <AppInner />;
}

export default App;
