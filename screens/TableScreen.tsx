import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { CardCapture } from '@/components/CardCapture';
import { TableOverlay } from '@/components/TableOverlay';
import { useGame } from '@/hooks/GameContext';
import { TableDetection, TableLayout } from '@/types/poker';
import { groupTable, lowConfidenceCards } from '@/utils/tableLayout';

interface Scan {
  uri: string;
  detection: TableDetection;
  layout: TableLayout;
}

export function TableScreen() {
  const router = useRouter();
  const { loadGame } = useGame();
  const [scan, setScan] = useState<Scan | null>(null);

  const showWinner = (layout: TableLayout) => {
    loadGame(layout.community.map((card) => card.card), layout.players.map((hand) => hand.map((card) => card.card)));
    router.push('/results');
  };

  const handleTable = (detection: TableDetection, uri: string) => {
    const layout = detection.cards.length
      ? groupTable(detection.cards)
      : { ok: false, community: [], players: [], dropped: [], message: detection.message ?? 'No cards were detected.' };
    setScan({ uri, detection, layout });
    if (layout.ok && !layout.dropped.length && !lowConfidenceCards(layout).length) showWinner(layout);
  };

  const layout = scan?.layout ?? null;
  const weak = layout ? lowConfidenceCards(layout) : [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.step}>ONE PHOTO</Text>
        <Text style={styles.title}>Scan the table</Text>
        <Text style={styles.copy}>
          Photograph the five board cards and every player's two cards together, with all card corners visible.
          The app finds the cards, works out who holds what, and shows the winner. Landscape photos work best.
        </Text>

        {scan && (
          <View style={styles.scan}>
            <TableOverlay
              uri={scan.uri}
              imageWidth={scan.detection.imageWidth}
              imageHeight={scan.detection.imageHeight}
              cards={scan.detection.cards}
              layout={layout}
            />
            <Text style={[styles.summary, !layout?.ok && styles.problem]}>
              {layout?.ok
                ? `Found ${layout.community.length} board cards and ${layout.players.length} players.`
                : layout?.message}
            </Text>
            {weak.length > 0 && (
              <Text style={styles.notice}>
                Not sure about {weak.map((card) => card.code).join(', ')}. Check them against the photo before
                continuing, or scan again with a sharper, closer photo.
              </Text>
            )}
            {layout?.ok && layout.message && <Text style={styles.notice}>{layout.message}</Text>}
            {layout?.ok && (
              <Pressable style={styles.winner} onPress={() => showWinner(layout)}>
                <Ionicons name="trophy" size={20} color={colors.background} />
                <Text style={styles.winnerText}>Show winner</Text>
              </Pressable>
            )}
          </View>
        )}

        <CardCapture table label={scan ? 'Scan again' : 'Take table photo'} onTable={handleTable} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { ...contentWidth, padding: 22, paddingBottom: 40 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  step: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 8 },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 25 },
  scan: { gap: 12, marginBottom: 20 },
  summary: { color: colors.text, fontWeight: '700', fontSize: 15, lineHeight: 21 },
  problem: { color: colors.danger },
  notice: { color: colors.textMuted, backgroundColor: colors.surface, padding: 12, borderRadius: 12, lineHeight: 19 },
  winner: { height: 56, backgroundColor: colors.primary, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  winnerText: { color: colors.background, fontWeight: '900', fontSize: 16 },
});
