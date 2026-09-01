import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

type Status = "connecting" | "live" | "error";

type Props = {
  onPress: () => void;
  status: Status;
};

const liquidGlassAvailable =
  Platform.OS === "ios" &&
  isGlassEffectAPIAvailable() &&
  isLiquidGlassAvailable();

export function LiquidGlassButton({ onPress, status }: Props) {
  const control = (
    <Pressable
      accessibilityHint="Opens native connection and app controls"
      accessibilityLabel="Open Pressure Atlas controls"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressablePressed,
      ]}
    >
      <View
        style={[
          styles.status,
          status === "live"
            ? styles.statusLive
            : status === "error"
              ? styles.statusError
              : styles.statusConnecting,
        ]}
      />
      <Text style={styles.label}>Controls</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  if (liquidGlassAvailable) {
    return (
      <GlassView
        colorScheme="dark"
        glassEffectStyle="regular"
        isInteractive
        style={styles.surface}
        tintColor="rgba(19, 75, 58, 0.28)"
      >
        {control}
      </GlassView>
    );
  }

  return <View style={[styles.surface, styles.fallback]}>{control}</View>;
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 23,
    height: 46,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 9,
    width: 122,
  },
  fallback: {
    backgroundColor: "rgba(19, 31, 29, 0.86)",
    borderColor: "rgba(255, 255, 255, 0.32)",
    borderWidth: 1,
    elevation: 9,
  },
  pressable: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 14,
  },
  pressablePressed: {
    backgroundColor: "rgba(255, 255, 255, 0.13)",
    transform: [{ scale: 0.97 }],
  },
  status: {
    borderColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    marginRight: 9,
    width: 10,
  },
  statusLive: {
    backgroundColor: "#65e393",
    shadowColor: "#65e393",
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  statusConnecting: {
    backgroundColor: "#e3b950",
  },
  statusError: {
    backgroundColor: "#ff625d",
  },
  label: {
    color: "#fff",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
    textShadowColor: "rgba(0,0,0,0.36)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chevron: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 22,
    fontWeight: "400",
    marginLeft: 3,
    marginTop: -2,
  },
});
