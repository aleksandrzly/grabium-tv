import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {BackHandler, View, StyleSheet} from 'react-native';
import {
  UserInputEventName,
  useAddUserInputListenerCallback,
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
  WebViewMessageEvent,
  WebViewMethods,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {handleBridgeMessage, isExitMessage, replyScript} from './bridge';

export const App = () => {
  const webRef = useRef<WebViewMethods | null>(null);
  // By default splash screen is shown in app launch, as the splash
  // screen images are bundled in this app (assets/raw/ folder)
  // Declare that application wants to extend splash screen lifecycle
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();

  // Vega delivers ≡ (Menu) only to RN, and once any RN input listener is
  // registered it routes Back to RN too (found 2026-09-23: Back then
  // backgrounded the app from every screen and never reached the page).
  // So RN claims both keys and replays them into the page as the key events
  // FireTv/web/src/lib/remote.js already handles; the web app owns
  // navigation and asks for exitApp from the lobby.
  const addUserInputListener = useAddUserInputListenerCallback();
  useEffect(() => {
    const replay = (key: string) => ({phase}: {phase: string}) => {
      const type = phase === 'PRESSED' ? 'keydown' : 'keyup';
      webRef.current?.injectJavaScript(
        `window.dispatchEvent(new KeyboardEvent('${type}', {key: '${key}', code: '${key}'})); true;`,
      );
      return true;
    };
    const subscriptions = [
      addUserInputListener(UserInputEventName.Menu, replay('ContextMenu')),
      addUserInputListener(UserInputEventName.Back, replay('GoBack')),
    ];
    // Belt and braces: the legacy BackHandler path must not background the
    // app either.
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      subscriptions.forEach(sub => sub.remove());
      backHandler.remove();
    };
  }, [addUserInputListener]);
  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        // thirdPartyCookiesEnabled
        // userAgent={''}
        source={{
          // headers: {},
          uri: "file:///pkg/assets/index.html",
        }}
        onLoad={(_event: WebViewNavigationEvent) => {
          console.info('Page loading completed...');
          // Hide the splash screen
          hideSplashScreenCallback();
        }}
        onMessage={async (event: WebViewMessageEvent) => {
          // The WebView takes the remote's Back key, so the web app decides
          // when Back means "leave the app" (from the lobby) and asks here.
          if (isExitMessage(event.nativeEvent.data)) {
            BackHandler.exitApp();
            return;
          }
          const reply = await handleBridgeMessage(event.nativeEvent.data);
          if (reply) {
            webRef.current?.injectJavaScript(replyScript(reply));
          }
        }}
        onLoadStart={(_event: WebViewNavigationEvent) => {
          console.info('Page loading started...');
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${code}: ${url}) ${description}`);
          console.error(`[onHttpError]: isMainFrame: ${isMainFrame}`);
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[onSslError]: (${code}: ${url}) ${description}`);
        }}
      />
    </View>
  );
};

// Styles for layout, which are necessary for proper focus behavior
const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#000000'},
});
