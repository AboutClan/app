import React, {useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import firebase from '@react-native-firebase/app';

import SplashScreen from 'react-native-splash-screen';

import AppInner from './AppInner';
import {firebaseConfig} from './src/constants/firebase';
import {useNetworkStatus} from './src/libs/useNetworkStatus';
import {configurePushNotifications} from './src/libs/configurePushNotifications';

const SPLASH_SCREEN_DELAY = 1000;

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const App: React.FC = () => {
  const {isOffline} = useNetworkStatus();

  useEffect(() => {
    configurePushNotifications();

    const splashTimer = setTimeout(() => {
      SplashScreen.hide();
    }, SPLASH_SCREEN_DELAY);

    return () => {
      clearTimeout(splashTimer);
    };
  }, []);

  if (isOffline) {
    return <View style={styles.offlineContainer} />;
  }

  return <AppInner />;
};

const styles = StyleSheet.create({
  offlineContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
});

export default App;
