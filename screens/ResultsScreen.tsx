import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/constants/theme';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui';
import { contentWidth } from '@/constants/layout';
import { useGame } from '@/hooks/GameContext';
import { calculateResults } from '@/utils/pokerEngine';
import { validateGame } from '@/utils/cardValidation';
import { PlayingCard } from '@/components/PlayingCard';

export function ResultsScreen() {
  const router = useRouter();
  const { community, players, reset } = useGame();
  const problem = useMemo(() => validateGame(community, players), [community, players]);
  const results = useMemo(() => (problem ? [] : calculateResults(community, players)), [problem, community, players]);
  const tied = results.filter((result) => result.isWinner).length > 1;

  if (problem) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
          <Text style={styles.errorTitle}>No results to show</Text>
          <Text style={styles.errorCopy}>{problem}</Text>
          <Button label="Back to start" onPress={() => router.replace('/')} style={styles.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>SHOWDOWN COMPLETE</Text><Text accessibilityRole="header" style={styles.title}>Poker results</Text></View>
          <View style={styles.done}><Ionicons name="checkmark" size={18} color={colors.success} /><Text style={styles.doneText}>Complete</Text></View>
        </View>
        <View style={styles.board}>
          <Text style={styles.boardLabel}>THE BOARD</Text>
          <View style={styles.boardCards}>{community.map((card) => <PlayingCard key={`${card.rank}-${card.suit}`} card={card} compact />)}</View>
        </View>
        {results.map((result) => (
          <View key={result.player.id} style={[styles.result, result.isWinner && styles.winner]}>
            {result.isWinner && (
              <View style={styles.badge}><Ionicons name="trophy" size={14} color={colors.onPrimary} /><Text style={styles.badgeText}>{tied ? 'TIED WINNER' : 'WINNER'}</Text></View>
            )}
            <View style={styles.resultTop}>
              <View>
                <Text style={styles.playerName}>{result.player.name}</Text>
                <Text style={[styles.hand, result.isWinner && styles.handWinner]}>{result.hand.category}</Text>
              </View>
              <Text style={[styles.percentage, result.isWinner && styles.percentageWinner]}>{Number.isInteger(result.percentage) ? result.percentage : result.percentage.toFixed(1)}%</Text>
            </View>
            <View style={styles.privateCards}>{result.player.cards.map((card) => <PlayingCard key={`${card.rank}-${card.suit}`} card={card} compact />)}</View>
            <View style={styles.track}><View style={[styles.fill, result.isWinner && styles.fillWinner, { width: `${result.percentage}%` }]} /></View>
            <Text style={styles.share}>{result.percentage ? 'Share of the pot' : 'No share of the pot'}</Text>
          </View>
        ))}
        <Button label="Edit players" icon="create-outline" variant="outline" onPress={() => router.back()} style={styles.secondary} />
        <Button label="Start another game" onPress={() => { reset(); router.replace('/'); }} style={styles.primary} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  errorTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  errorCopy: { color: colors.textMuted, textAlign: 'center', marginBottom: 12 },
  container: { ...contentWidth, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4, marginBottom: 20 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.6, marginTop: 6 },
  done: { flexDirection: 'row', gap: 5, backgroundColor: colors.successMuted, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20 },
  doneText: { color: colors.successText, fontSize: 12, fontWeight: '800' },
  board: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...shadow },
  boardLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 11 },
  boardCards: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  result: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden', ...shadow },
  winner: { borderColor: colors.success, borderWidth: 2, backgroundColor: '#f4fcf8' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: 5, backgroundColor: colors.success, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, marginBottom: 14 },
  badgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  playerName: { color: colors.text, fontSize: 20, fontWeight: '900' },
  hand: { color: colors.textMuted, marginTop: 4, fontWeight: '700' },
  handWinner: { color: colors.successText },
  percentage: { color: colors.textMuted, fontSize: 31, fontWeight: '900' },
  percentageWinner: { color: colors.success, fontSize: 38 },
  privateCards: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  track: { height: 8, backgroundColor: colors.surfaceRaised, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#c7c7c7', borderRadius: 4 },
  fillWinner: { backgroundColor: colors.success },
  share: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  secondary: { marginTop: 8 },
  primary: { alignSelf: 'stretch', marginTop: 12 },
});
