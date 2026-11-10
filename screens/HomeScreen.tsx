import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadow } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { useGame } from '@/hooks/GameContext';
import { useAiConnection } from '@/hooks/useAiConnection';
import { useOpenRouterReturn } from '@/hooks/useOpenRouterReturn';
import { AppHeader } from '@/components/AppHeader';
import { PlayingCard } from '@/components/PlayingCard';
import { Button, Kicker } from '@/components/ui';
import { PROVIDERS } from '@/services/ai/types';
import { Card } from '@/types/poker';

const SHOWCASE: Card[] = [
  { rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }, { rank: 'Q', suit: 'spades' },
  { rank: 'J', suit: 'spades' }, { rank: '10', suit: 'spades' },
];

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }[] = [
  { icon: 'camera-outline', title: 'Capture', copy: 'Photograph the board and every hand, or scan the whole table in one shot.' },
  { icon: 'people-outline', title: 'Check the cards', copy: 'See what was read, with a confidence for each card, and correct anything in a tap.' },
  { icon: 'trophy-outline', title: 'Know the winner', copy: 'The best hand and each player\'s share of the pot, split pots included.' },
];

export function HomeScreen() {
  const router = useRouter();
  const { reset } = useGame();
  const connection = useAiConnection();
  useOpenRouterReturn();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <View style={styles.tag}><Text style={styles.tagText}>TEXAS HOLD'EM</Text></View>
            <Text accessibilityRole="header" style={styles.title}>See the hand.{'\n'}Know the <Text style={styles.accent}>winner.</Text></Text>
            <Text style={styles.copy}>
              Capture the board and every player's hole cards. Poker Vision reads them and works out the showdown instantly.
            </Text>
            <View style={styles.showcase}>
              {SHOWCASE.map((card) => <PlayingCard key={card.rank} card={card} compact />)}
            </View>
            <View style={styles.actions}>
              <Button label="Start new game" trailingIcon="arrow-forward" onPress={() => { reset(); router.push('/community'); }} />
              <Button label="Scan whole table" icon="scan-outline" variant="darkOutline" onPress={() => { reset(); router.push('/table'); }} />
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Kicker>How it works</Kicker>
          <Text style={styles.sectionTitle}>Three steps to the result</Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepIcon}><Ionicons name={step.icon} size={24} color={colors.primary} /></View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{index + 1}. {step.title}</Text>
                <Text style={styles.stepCopy}>{step.copy}</Text>
              </View>
            </View>
          ))}

          <View style={styles.ai}>
            <View style={styles.aiHead}>
              <View style={styles.aiIcon}><Ionicons name="sparkles" size={20} color={colors.primary} /></View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{connection ? 'AI second opinion is on' : 'Add an AI second opinion'}</Text>
                <Text style={styles.stepCopy}>
                  {connection
                    ? `Connected with ${PROVIDERS[connection.provider].label}. Use "Check with AI" after a scan.`
                    : 'Optional. Connect your own Claude, ChatGPT, Gemini or OpenRouter account to double-check hard photos.'}
                </Text>
              </View>
            </View>
            <Button
              label={connection ? 'AI settings' : 'Connect AI'}
              variant={connection ? 'outline' : 'secondary'}
              icon={connection ? 'settings-outline' : 'link-outline'}
              onPress={() => router.push('/ai')}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerInner}>
            <Ionicons name="lock-closed-outline" size={16} color="#a8a8a8" />
            <Text style={styles.footerText}>Cards are read on your device. Photos are only sent anywhere if you turn on AI.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.ink, paddingVertical: 36, paddingHorizontal: 22 },
  heroInner: { ...contentWidth },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 18 },
  tagText: { color: colors.onPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#ffffff', fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.4 },
  accent: { color: colors.primary },
  copy: { color: '#a8a8a8', fontSize: 16, lineHeight: 25, marginTop: 16, maxWidth: 460 },
  showcase: { flexDirection: 'row', gap: 8, marginVertical: 28 },
  actions: { gap: 12, maxWidth: 460 },
  body: { ...contentWidth, padding: 22, paddingTop: 34, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4, marginBottom: 6 },
  step: {
    flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow,
  },
  stepIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
  stepTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  stepCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 3 },
  ai: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10, ...shadow },
  aiHead: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  aiIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  footer: { backgroundColor: colors.text, marginTop: 28, paddingVertical: 22, paddingHorizontal: 22 },
  footerInner: { ...contentWidth, flexDirection: 'row', gap: 10, alignItems: 'center' },
  footerText: { flex: 1, color: '#a8a8a8', fontSize: 13, lineHeight: 19 },
});
