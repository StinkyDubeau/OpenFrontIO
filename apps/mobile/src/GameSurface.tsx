import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";

import { AtlasButton } from "./components/AtlasButton";
import {
  appStateScript,
  GAME_URL,
  NATIVE_BRIDGE_BOOTSTRAP,
  safeAreaScript,
} from "./config/game";

type LoadState = "connecting" | "live" | "error";

export function GameSurface() {
  const webView = useRef<WebView>(null);
  const loadFailed = useRef(false);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("connecting");
  const [reloadKey, setReloadKey] = useState(0);
  const nativeBootstrap = useMemo(
    () =>
      `${NATIVE_BRIDGE_BOOTSTRAP}\n${safeAreaScript(
        insets.top,
        insets.right,
        insets.bottom,
        insets.left,
      )}`,
    [insets.bottom, insets.left, insets.right, insets.top],
  );

  const hardReload = () => {
    setLoadState("connecting");
    setReloadKey((current) => current + 1);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      webView.current?.injectJavaScript(appStateScript(state));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    webView.current?.injectJavaScript(
      safeAreaScript(insets.top, insets.right, insets.bottom, insets.left),
    );
  }, [insets.bottom, insets.left, insets.right, insets.top]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canGoBack) {
          webView.current?.goBack();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [canGoBack]);

  const updateNavigation = (navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
  };

  return (
    <View style={styles.root}>
      <WebView
        key={reloadKey}
        ref={webView}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        applicationNameForUserAgent="PressureAtlasNative/0.1.0"
        bounces={false}
        cacheEnabled
        contentInsetAdjustmentBehavior="never"
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={nativeBootstrap}
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onError={() => {
          loadFailed.current = true;
          setLoadState("error");
        }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 400) {
            loadFailed.current = true;
            setLoadState("error");
          }
        }}
        onLoadEnd={() => {
          if (!loadFailed.current) setLoadState("live");
        }}
        onLoadStart={() => {
          loadFailed.current = false;
          setLoadState("connecting");
        }}
        onNavigationStateChange={updateNavigation}
        originWhitelist={["http://*", "https://*"]}
        overScrollMode="never"
        pullToRefreshEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{ uri: GAME_URL }}
        startInLoadingState={false}
        style={styles.webView}
        thirdPartyCookiesEnabled
      />

      {loadState === "connecting" ? (
        <View
          pointerEvents="none"
          style={[
            styles.connectionPlate,
            {
              top: Math.max(insets.top, 8),
              right: Math.max(insets.right, 9),
            },
          ]}
        >
          <Text style={styles.connectionText}>CONNECTING</Text>
        </View>
      ) : null}

      {loadState === "error" ? (
        <View style={styles.errorWrap}>
          <LinearGradient
            colors={["#543921", "#211711", "#0f0d0b"]}
            style={styles.errorPanel}
          >
            <Text style={styles.errorEyebrow}>FIELD TERMINAL</Text>
            <Text style={styles.errorTitle}>
              The game surface is unreachable.
            </Text>
            <Text style={styles.errorCopy}>
              Confirm that this phone can reach {GAME_URL} and that the game
              server is still running.
            </Text>
            <AtlasButton
              detail="Reconnect without deleting your stored session"
              glyph="↻"
              label="Try again"
              onPress={hardReload}
              tone="amber"
            />
          </LinearGradient>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#05090c",
  },
  webView: {
    backgroundColor: "#05090c",
    flex: 1,
  },
  connectionPlate: {
    backgroundColor: "rgba(17,21,20,0.92)",
    borderColor: "#8c826a",
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
  },
  connectionText: {
    color: "#e9dec0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  errorWrap: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    alignItems: "center",
    backgroundColor: "rgba(2,6,8,0.88)",
    justifyContent: "center",
    padding: 22,
  },
  errorPanel: {
    borderColor: "#957548",
    borderRadius: 14,
    borderWidth: 2,
    maxWidth: 390,
    padding: 17,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    width: "100%",
    elevation: 20,
  },
  errorEyebrow: {
    color: "#c4a972",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  errorTitle: {
    color: "#f4e7c8",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 22,
    fontWeight: "700",
    marginTop: 5,
  },
  errorCopy: {
    color: "rgba(240,230,204,0.72)",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 15,
    marginTop: 8,
  },
});
