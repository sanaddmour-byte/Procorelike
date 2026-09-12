import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { i18n } from "@/lib/i18n";
import { borders, brutalShadow, colors, fonts } from "@/lib/theme";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React Native has no per-screen equivalent of Next.js's error.tsx --
 * a thrown render error unmounts the whole tree with a red screen in
 * dev and a blank screen in production. This wraps the root Stack once
 * so any screen's render error lands on a recoverable fallback instead.
 * Must be a class component: componentDidCatch/getDerivedStateFromError
 * have no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{i18n.t("common.errorBoundaryTitle")}</Text>
          <Text style={styles.body}>{i18n.t("common.errorBoundaryBody")}</Text>
          <TouchableOpacity style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>{i18n.t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: colors.cream,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.navy900,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.navy700,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    borderWidth: borders.thick,
    borderColor: colors.ink,
    borderRadius: borders.radius,
    backgroundColor: colors.orange500,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...brutalShadow(),
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
});
