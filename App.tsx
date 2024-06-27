import React, {useRef} from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';

type Nullable<TData> = TData | null;

const uri = 'https://studyabout.herokuapp.com/login';

function App(): React.JSX.Element {
  const webviewRef = useRef<Nullable<WebView>>(null);
  const onGetMessage = async (event: WebViewMessageEvent) =>
    console.log('event:', event);

  return (
    <SafeAreaView style={styles.safeAreaView}>
      <WebView
        source={{uri}}
        bounces={false}
        ref={webviewRef}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onGetMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaView: {
    flex: 1,
  },
});

export default App;
