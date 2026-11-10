import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useGame } from '@/hooks/GameContext';

export function HomeScreen() {
  const router = useRouter();
  const { reset } = useGame();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brand}><View style={styles.logo}><Ionicons name="diamond" size={25} color={colors.primary} /></View><Text style={styles.brandText}>POKER VISION</Text></View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>TEXAS HOLD'EM</Text>
        <Text style={styles.title}>See the hand.{'\n'}Know the winner.</Text>
        <Text style={styles.copy}>Capture the board and every player's hole cards. Poker Vision evaluates the showdown locally and instantly.</Text>
      </View>
      <View style={styles.featureRow}>
        <View style={styles.feature}><Ionicons name="camera-outline" size={23} color={colors.primary} /><Text style={styles.featureText}>Capture</Text></View>
        <View style={styles.line} />
        <View style={styles.feature}><Ionicons name="people-outline" size={23} color={colors.primary} /><Text style={styles.featureText}>Add players</Text></View>
        <View style={styles.line} />
        <View style={styles.feature}><Ionicons name="trophy-outline" size={23} color={colors.primary} /><Text style={styles.featureText}>Compare</Text></View>
      </View>
      <Pressable style={styles.button} onPress={() => { reset(); router.push('/community'); }}>
        <Text style={styles.buttonText}>Start new game</Text><Ionicons name="arrow-forward" size={21} color={colors.background} />
      </Pressable>
      <Text style={styles.footnote}>Cards stay on your device</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  logo: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  hero: { flex: 1, justifyContent: 'center' },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: '800', letterSpacing: 2.5, marginBottom: 14 },
  title: { color: colors.text, fontSize: 44, lineHeight: 49, fontWeight: '900', letterSpacing: -1.5 },
  copy: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 20, maxWidth: 390 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 38 },
  feature: { alignItems: 'center', gap: 8 },
  featureText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  line: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: 10 },
  button: { height: 58, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: colors.background, fontWeight: '900', fontSize: 17 },
  footnote: { color: colors.textMuted, textAlign: 'center', marginVertical: 14, fontSize: 12 },
});
