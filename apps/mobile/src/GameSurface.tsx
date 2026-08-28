import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";

import { AtlasButton } from "./components/AtlasButton";
import { NativeDeck } from "./components/NativeDeck";
import {
  appStateScript,
  GAME_URL,
  NATIVE_BRIDGE_BOOTSTRAP,
} from "./config/game";

type LoadState = "connecting" | "live" | "error";

export function GameSurface() {
  const webView = useRef<WebView>(null);
  const loadFailed = useRef(false);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [deckVisible, setDeckVisible] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("connecting");
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => {
    setLoadState("connecting");
    webView.current?.reload();
  };

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
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (deckVisible) {
          setDeckVisible(false);
          return true;
        }
        if (canGoBack) {
          webView.current?.goBack();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [canGoBack, deckVisible]);

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
        injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE_BOOTSTRAP}
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

      <View
        pointerEvents="box-none"
        style={[
          styles.chrome,
          {
            paddingTop: Math.max(insets.top, 8),
            paddingLeft: Math.max(insets.left, 9),
            paddingRight: Math.max(insets.right, 9),
          },
        ]}
      >
        <Pressable
          accessibilityHint="Opens native connection and app controls"
          accessibilityLabel="Open Pressure Atlas command deck"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDeckVisible(true);
          }}
          style={({ pressed }) => [
            styles.deckTrigger,
            pressed && styles.deckTriggerPressed,
          ]}
        >
          <LinearGradient
            colors={["#ebe4ce", "#98917f", "#4a4a43"]}
            style={styles.triggerRing}
          >
            <View style={styles.triggerFace}>
              <Text style={styles.triggerGlyph}>◈</Text>
              <View
                style={[
                  styles.triggerLamp,
                  loadState === "live"
                    ? styles.triggerLampLive
                    : loadState === "error"
                      ? styles.triggerLampError
                      : styles.triggerLampLoading,
                ]}
              />
            </View>
          </LinearGradient>
        </Pressable>

        {loadState !== "live" ? (
          <View style={styles.connectionPlate}>
            <Text style={styles.connectionText}>
              {loadState === "error" ? "LINK LOST" : "CONNECTING"}
            </Text>
          </View>
        ) : null}
      </View>

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

      <View
        pointerEvents={deckVisible ? "auto" : "none"}
        style={[
          styles.deckLayer,
          {
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 8),
            paddingLeft: Math.max(insets.left, 0),
            paddingRight: Math.max(insets.right, 0),
          },
        ]}
      >
        <NativeDeck
          canGoBack={canGoBack}
          gameUrl={GAME_URL}
          onBack={() => webView.current?.goBack()}
          onClose={() => setDeckVisible(false)}
          onReload={reload}
          visible={deckVisible}
        />
      </View>
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
  chrome: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  deckTrigger: {
    borderRadius: 23,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.67,
    shadowRadius: 5,
    elevation: 10,
  },
  deckTriggerPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
  triggerRing: {
    alignItems: "center",
    borderColor: "#161715",
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  triggerFace: {
    alignItems: "center",
    backgroundColor: "#15231f",
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  triggerGlyph: {
    color: "#efe5c8",
    fontSize: 24,
    fontWeight: "900",
    marginTop: -2,
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  triggerLamp: {
    borderColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    borderWidth: 1,
    bottom: 2,
    height: 7,
    position: "absolute",
    right: 2,
    width: 7,
  },
  triggerLampLive: {
    backgroundColor: "#72f0a4",
  },
  triggerLampLoading: {
    backgroundColor: "#e2bc54",
  },
  triggerLampError: {
    backgroundColor: "#ff625d",
  },
  connectionPlate: {
    backgroundColor: "rgba(17,21,20,0.92)",
    borderColor: "#8c826a",
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  deckLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
