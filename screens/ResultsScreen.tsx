import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { useGame } from '@/hooks/GameContext';
import { calculateResults } from '@/utils/pokerEngine';
import { PlayingCard } from '@/components/PlayingCard';

export function ResultsScreen() {
  const router = useRouter();
  const { community, players, reset } = useGame();
  const results = useMemo(() => calculateResults(community, players), [community, players]);
  const tied = results.filter((result) => result.isWinner).length > 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>SHOWDOWN COMPLETE</Text><Text style={styles.title}>Poker results</Text></View>
          <View style={styles.done}><Ionicons name="checkmark" size={18} color={colors.primary} /><Text style={styles.doneText}>Complete</Text></View>
        </View>
        <View style={styles.board}>
          <Text style={styles.boardLabel}>THE BOARD</Text>
          <View style={styles.boardCards}>{community.map((card) => <PlayingCard key={`${card.rank}-${card.suit}`} card={card} compact />)}</View>
        </View>
        {results.map((result) => (
          <View key={result.player.id} style={[styles.result, result.isWinner && styles.winner]}>
            {result.isWinner && (
              <View style={styles.badge}><Ionicons name="trophy" size={14} color={colors.background} /><Text style={styles.badgeText}>{tied ? 'TIED WINNER' : 'WINNER'}</Text></View>
            )}
            <View style={styles.resultTop}>
              <View>
                <Text style={styles.playerName}>{result.player.name}</Text>
                <Text style={[styles.hand, result.isWinner && styles.handWinner]}>{result.hand.category}</Text>
              </View>
              <Text style={[styles.percentage, result.isWinner && styles.percentageWinner]}>{Number.isInteger(result.percentage) ? result.percentage : result.percentage.toFixed(1)}%</Text>
            </View>
            <View style={styles.privateCards}>{result.player.cards.map((card) => <PlayingCard key={`${card.rank}-${card.suit}`} card={card} compact />)}</View>
            <View style={styles.track}><View style={[styles.fill, { width: `${result.percentage}%` }]} /></View>
            <Text style={styles.share}>{result.percentage ? 'Share of the pot' : 'No share of the pot'}</Text>
          </View>
        ))}
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Ionicons name="create-outline" size={20} color={colors.text} /><Text style={styles.secondaryText}>Edit players</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => { reset(); router.replace('/'); }}>
          <Text style={styles.primaryText}>Start another game</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 22, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12, marginBottom: 24 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 6 },
  done: { flexDirection: 'row', gap: 5, backgroundColor: colors.primaryMuted, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20 },
  doneText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  board: { backgroundColor: colors.surface, borderRadius: 17, padding: 15, marginBottom: 20 },
  boardLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 11 },
  boardCards: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  result: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden' },
  winner: { borderColor: colors.primary, backgroundColor: '#11271b' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: 5, backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, marginBottom: 14 },
  badgeText: { color: colors.background, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  playerName: { color: colors.text, fontSize: 20, fontWeight: '900' },
  hand: { color: colors.textMuted, marginTop: 4, fontWeight: '700' },
  handWinner: { color: colors.primary },
  percentage: { color: colors.textMuted, fontSize: 31, fontWeight: '900' },
  percentageWinner: { color: colors.primary, fontSize: 38 },
  privateCards: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  track: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  share: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  secondary: { height: 54, borderRadius: 15, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: colors.text, fontWeight: '800' },
  primary: { height: 56, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: colors.background, fontWeight: '900', fontSize: 16 },
});
