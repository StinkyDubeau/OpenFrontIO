import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { SOURCE_URL } from "../config/game";
import { AtlasButton } from "./AtlasButton";

type Props = {
  canGoBack: boolean;
  gameUrl: string;
  onBack: () => void;
  onClose: () => void;
  onReload: () => void;
  visible: boolean;
};

export function NativeDeck({
  canGoBack,
  gameUrl,
  onBack,
  onClose,
  onReload,
  visible,
}: Props) {
  const reveal = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const { height, width } = useWindowDimensions();
  const compact = height < 560;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.spring(reveal, {
      damping: 20,
      mass: 0.7,
      stiffness: 240,
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [reveal, visible]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="Close command deck"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.scrim}
      />
      <Animated.View
        style={[
          styles.deck,
          {
            maxWidth: Math.min(compact ? 560 : 372, width - 22),
            opacity: reveal,
            transform: [
              {
                translateY: reveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-34, 0],
                }),
              },
              {
                scale: reveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={["#5b3a20", "#24170f", "#100c09"]}
          style={styles.wood}
        >
          <View pointerEvents="none" style={styles.woodGrainOne} />
          <View pointerEvents="none" style={styles.woodGrainTwo} />
          <View style={[styles.header, compact && styles.headerCompact]}>
            <View style={styles.screw} />
            <View style={styles.titleGroup}>
              <Text style={styles.eyebrow}>PRESSURE ATLAS</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>
                Command Deck
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close command deck"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={[styles.felt, compact && styles.feltCompact]}>
            <View
              style={[styles.statusRow, compact && styles.statusRowCompact]}
            >
              <View style={styles.lampOuter}>
                <View style={styles.lampInner} />
              </View>
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>SESSION LINK ACTIVE</Text>
                <Text numberOfLines={1} style={styles.statusUrl}>
                  {gameUrl}
                </Text>
              </View>
            </View>

            <View style={styles.buttonStack}>
              <AtlasButton
                compact={compact}
                detail="Refresh the map without clearing session data"
                glyph="↻"
                label="Reload game surface"
                onPress={() => {
                  onReload();
                  onClose();
                }}
                tone="emerald"
              />
              <AtlasButton
                compact={compact}
                detail="Return to the previous in-game screen"
                disabled={!canGoBack}
                glyph="‹"
                label="Back"
                onPress={() => {
                  onBack();
                  onClose();
                }}
              />
              <AtlasButton
                compact={compact}
                detail="Open the public source and attribution"
                glyph="⌘"
                label="Source & license"
                onPress={() => void Linking.openURL(SOURCE_URL)}
                tone="amber"
              />
            </View>

            {!compact ? (
              <Text style={styles.legal}>
                Pressure Atlas is based on OpenFront. Game rendering and
                gameplay remain inside the original web surface; this deck is
                native app chrome.
              </Text>
            ) : null}
          </View>

          <View
            style={[styles.footerRail, compact && styles.footerRailCompact]}
          >
            <View style={styles.screwSmall} />
            <Text style={styles.footerText}>
              {Platform.OS.toUpperCase()} FIELD TERMINAL · SHELL 0.1
            </Text>
            <View style={styles.screwSmall} />
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(1,5,7,0.67)",
  },
  deck: {
    alignSelf: "center",
    borderColor: "#8b6a39",
    borderRadius: 17,
    borderWidth: 1,
    marginHorizontal: 11,
    marginTop: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.82,
    shadowRadius: 20,
    width: "100%",
    elevation: 24,
  },
  wood: {
    borderColor: "#0c0805",
    borderRadius: 16,
    borderWidth: 3,
    padding: 9,
  },
  woodGrainOne: {
    backgroundColor: "rgba(220,145,72,0.08)",
    height: 2,
    left: -30,
    position: "absolute",
    right: 45,
    top: 29,
    transform: [{ rotate: "-2deg" }],
  },
  woodGrainTwo: {
    backgroundColor: "rgba(0,0,0,0.19)",
    height: 3,
    left: 40,
    position: "absolute",
    right: -20,
    top: 78,
    transform: [{ rotate: "1deg" }],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 61,
    paddingHorizontal: 8,
  },
  headerCompact: {
    minHeight: 45,
  },
  screw: {
    backgroundColor: "#ac956c",
    borderColor: "#33291c",
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 1,
    width: 12,
  },
  titleGroup: {
    flex: 1,
    marginHorizontal: 12,
  },
  eyebrow: {
    color: "#c7ac78",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: {
    color: "#f7e8c7",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 23,
    fontWeight: "700",
    marginTop: -1,
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  titleCompact: {
    fontSize: 19,
  },
  close: {
    alignItems: "center",
    backgroundColor: "#151311",
    borderColor: "#a78a5c",
    borderRadius: 15,
    borderWidth: 1,
    height: 31,
    justifyContent: "center",
    width: 31,
  },
  closeText: {
    color: "#e9ddc1",
    fontSize: 27,
    fontWeight: "300",
    lineHeight: 28,
    marginTop: -2,
  },
  felt: {
    backgroundColor: "#17382e",
    borderColor: "#071d17",
    borderRadius: 10,
    borderWidth: 3,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  feltCompact: {
    padding: 8,
  },
  statusRow: {
    alignItems: "center",
    borderBottomColor: "rgba(230,219,184,0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    marginBottom: 11,
    paddingBottom: 10,
  },
  statusRowCompact: {
    marginBottom: 6,
    paddingBottom: 6,
  },
  lampOuter: {
    alignItems: "center",
    backgroundColor: "#18201d",
    borderColor: "#a89975",
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    marginRight: 9,
    width: 20,
  },
  lampInner: {
    backgroundColor: "#72f0a4",
    borderRadius: 5,
    height: 10,
    shadowColor: "#6dff9d",
    shadowOpacity: 1,
    shadowRadius: 7,
    width: 10,
  },
  statusCopy: {
    flex: 1,
  },
  statusTitle: {
    color: "#dfd4b8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  statusUrl: {
    color: "rgba(223,212,184,0.62)",
    fontSize: 10,
    marginTop: 2,
  },
  buttonStack: {
    gap: 9,
  },
  legal: {
    color: "rgba(232,224,197,0.67)",
    fontSize: 10,
    lineHeight: 14,
    marginHorizontal: 3,
    marginTop: 11,
  },
  footerRail: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 37,
    paddingHorizontal: 8,
  },
  footerRailCompact: {
    minHeight: 27,
  },
  screwSmall: {
    backgroundColor: "#8d7752",
    borderColor: "#1b160f",
    borderRadius: 4,
    borderWidth: 1,
    height: 8,
    width: 8,
  },
  footerText: {
    color: "#b49d74",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
});
