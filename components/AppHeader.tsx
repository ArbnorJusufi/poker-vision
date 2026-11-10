import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { useAiConnection } from '@/hooks/useAiConnection';

interface Props {
  onBack?: () => void;
  /** Hide the AI shortcut, e.g. on the AI settings screen itself. */
  hideAi?: boolean;
}

export function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.mark}><Ionicons name="diamond" size={16} color={colors.onPrimary} /></View>
      <Text style={styles.brandText}>POKER<Text style={styles.brandAccent}>VISION</Text></Text>
    </View>
  );
}

/** White top bar shared by every screen: brand on the left, the AI shortcut on the right. */
export function AppHeader({ onBack, hideAi }: Props) {
  const router = useRouter();
  const connection = useAiConnection();
  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <View style={styles.left}>
          {onBack && (
            <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.back} onPress={onBack} hitSlop={6}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          )}
          <Pressable accessibilityLabel="Poker Vision home" onPress={() => router.replace('/')}><Brand /></Pressable>
        </View>
        {!hideAi && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={connection ? 'AI connected. Open AI settings' : 'Connect AI'}
            style={[styles.ai, connection && styles.aiOn]}
            onPress={() => router.push('/ai')}
          >
            <Ionicons name="sparkles" size={14} color={connection ? colors.success : colors.primary} />
            <Text style={styles.aiText}>{connection ? 'AI on' : 'Connect AI'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  inner: { ...contentWidth, minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  brandAccent: { color: colors.primary },
  ai: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  aiOn: { backgroundColor: colors.successMuted, borderColor: colors.successMuted },
  aiText: { color: colors.text, fontSize: 13, fontWeight: '800' },
});
