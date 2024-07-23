import Config from 'react-native-config';
import type {ReactNativeFirebase} from '@react-native-firebase/app';

const firebaseConfig = {
  apiKey: Config.API_KEY,
  authDomain: Config.AUTH_DOMAIN,
  projectId: Config.PROJECT_ID,
  storageBucket: Config.STORAGE_BUCKET,
  messagingSenderId: Config.MESSAGING_SENDER_ID,
  appId: Config.APP_ID,
  measurementId: Config.MEASUREMENT_ID,
} as ReactNativeFirebase.FirebaseAppOptions;

export {firebaseConfig};
