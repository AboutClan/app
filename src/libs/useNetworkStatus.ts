import {useState, useEffect, useCallback} from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useNetworkStatus = () => {
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
