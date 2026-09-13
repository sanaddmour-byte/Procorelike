/**
 * Skeuomorphism design tokens shared across the mobile app: hairline
 * borders, soft blurred shadows for a raised-panel look, and the same
 * maroon / navy / orange palette carried over from the earlier
 * Neubrutalism build. Kept in one file so every screen's StyleSheet
 * pulls the same values instead of re-declaring hex literals.
 *
 * React Native's shadow API (iOS shadowColor/Offset/Opacity/Radius,
 * Android elevation) has no inset-shadow or multi-layer support the way
 * CSS box-shadow does, so this can't fully match the web redesign's
 * "raised panel with a glossy highlight" or "recessed input" look --
 * this gets as close as native shadows allow (a soft blurred drop
 * shadow) and documents the gap rather than reaching for a shadow
 * library or gradient library this app doesn't otherwise need.
 */

export const colors = {
  ink: "#171310",
  cream: "#fbf4e8",
  white: "#ffffff",

  maroon50: "#fbebec",
  maroon100: "#f4c9cc",
  maroon600: "#731c29",
  maroon700: "#5c1620",
  maroon800: "#451018",

  navy50: "#eef1f8",
  navy100: "#ccd6ea",
  navy600: "#182a51",
  navy700: "#13213f",
  navy800: "#0d182d",
  navy900: "#080f1c",

  orange50: "#fff4e6",
  orange100: "#ffe4bf",
  orange500: "#f97316",
  orange600: "#ea6a0a",
  orange700: "#c2470a",
  orange800: "#9a3412",
  orange900: "#7c2d12",
} as const;

export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extrabold: "Poppins_800ExtraBold",
} as const;

/** Soft, blurred, downward drop shadow -- the closest native equivalent to the web redesign's raised-panel shadow. Kept the "brutal" name since every screen already imports it; see the file-level comment for why the value changed instead. */
export function brutalShadow(size: 2 | 3 | 4 = 3) {
  return {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: size },
    shadowOpacity: 0.18,
    shadowRadius: size * 2,
    elevation: size + 1,
  };
}

export const borders = {
  // Was a flat 3px Neubrutalism border; skeuomorphism signals depth with
  // shadow instead, so this is now a hairline edge.
  thick: 1,
  radius: 12,
};
