import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'dark' | 'darkOutline' | 'success';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<Variant, { background: string; text: string; border?: string }> = {
  primary: { background: colors.primary, text: colors.onPrimary },
  success: { background: colors.success, text: colors.onPrimary },
  secondary: { background: colors.surfaceRaised, text: colors.text },
  outline: { background: colors.surface, text: colors.text, border: colors.border },
  dark: { background: colors.inkRaised, text: '#ffffff' },
  darkOutline: { background: 'transparent', text: '#ffffff', border: '#4d4d4d' },
};

export function Button({ label, onPress, icon, trailingIcon, variant = 'primary', disabled, loading, accessibilityLabel, style }: ButtonProps) {
  const look = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.background, borderColor: look.border ?? 'transparent', borderWidth: look.border ? 1 : 0 },
        pressed && !disabled && { opacity: 0.85 },
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={look.text} /> : icon ? <Ionicons name={icon} size={20} color={look.text} /> : null}
      <Text style={[styles.label, { color: look.text }]}>{label}</Text>
      {trailingIcon && !loading ? <Ionicons name={trailingIcon} size={20} color={look.text} /> : null}
    </Pressable>
  );
}

/** Small uppercase tag in the accent colour, used for steps and section kickers. */
export function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function ScreenTitle({ kicker, title, copy }: { kicker?: string; title: string; copy?: string }) {
  return (
    <View style={styles.titleBlock}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {copy ? <Text style={styles.copy}>{copy}</Text> : null}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 9,
  },
  label: { fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' },
  titleBlock: { marginTop: 4, marginBottom: 18 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.6, marginTop: 6 },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  panel: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow },
});
