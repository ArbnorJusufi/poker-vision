import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { CardCapture } from '@/components/CardCapture';
import { CardPickerModal } from '@/components/CardPickerModal';
import { PlayingCard } from '@/components/PlayingCard';
import { TableOverlay } from '@/components/TableOverlay';
import { useGame } from '@/hooks/GameContext';
import { Card, TableDetection, TableLayout } from '@/types/poker';
import { cardKey } from '@/utils/cardValidation';
import { LiveComparison, compareRecognition } from '@/utils/liveComparison';
import { groupTable, lowConfidenceCards } from '@/utils/tableLayout';

interface Scan {
  uri: string;
  detection: TableDetection;
  layout: TableLayout;
  comparison: LiveComparison | null;
}

interface Group {
  label: string;
  size: number;
  cards: Card[];
}

const BOARD_SIZE = 5;
const HAND_SIZE = 2;

function groupsFrom(layout: TableLayout): Group[] {
  if (!layout.ok) return [];
  return [
    { label: 'Board', size: BOARD_SIZE, cards: layout.community.map((card) => card.card) },
    ...layout.players.map((hand, index) => ({
      label: `Player ${index + 1}`, size: HAND_SIZE, cards: hand.map((card) => card.card),
    })),
  ];
}

export function TableScreen() {
  const router = useRouter();
  const { loadGame } = useGame();
  const [scan, setScan] = useState<Scan | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  const handleTable = (detection: TableDetection, uri: string, seenLive: string[]) => {
    const layout: TableLayout = detection.cards.length
      ? groupTable(detection.cards)
      : { ok: false, community: [], players: [], dropped: [], message: detection.message ?? 'No cards were detected.' };
    const used = layout.ok ? [...layout.community, ...layout.players.flat()].map((card) => card.code) : [];
    setScan({ uri, detection, layout, comparison: seenLive.length ? compareRecognition(seenLive, used) : null });
    setGroups(groupsFrom(layout));
  };

  const complete = groups.length > 0 && groups.every((group) => group.cards.length === group.size);
  const showWinner = () => {
    loadGame(groups[0].cards, groups.slice(1).map((group) => group.cards));
    router.push('/results');
  };

  const layout = scan?.layout ?? null;
  const weak = layout ? lowConfidenceCards(layout) : [];
  const blockedFor = (index: number) =>
    groups.flatMap((group, i) => (i === index ? [] : group.cards));
  const active = editing === null ? null : groups[editing];
  const changed = !!layout?.ok && groups.some((group, i) => {
    const original = i === 0 ? layout.community : layout.players[i - 1];
    return group.cards.length !== original.length
      || group.cards.some((card) => !original.some((found) => cardKey(found.card) === cardKey(card)));
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.step}>ONE PHOTO</Text>
        <Text style={styles.title}>Scan the table</Text>
        <Text style={styles.copy}>
          Point the camera at the board and every player's two cards. Cards are recognised live as you move; capture
          when the table is recognised, then check the result before the winner is shown.
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
                ? `Found ${layout.community.length} board cards and ${layout.players.length} players. Check them below.`
                : layout?.message}
            </Text>
            {scan.comparison && (
              <View style={[styles.compare, !scan.comparison.identical && styles.compareDiff]}>
                <Ionicons
                  name={scan.comparison.identical ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={scan.comparison.identical ? colors.primary : colors.gold}
                />
                <Text style={styles.compareText}>{scan.comparison.summary}</Text>
              </View>
            )}
            {weak.length > 0 && (
              <Text style={styles.notice}>
                Not sure about {weak.map((card) => card.code).join(', ')}. Check them against the photo, or scan again
                with a sharper, closer view.
              </Text>
            )}
            {layout?.ok && layout.message && <Text style={styles.notice}>{layout.message}</Text>}

            {groups.map((group, index) => (
              <Pressable
                key={group.label}
                accessibilityLabel={`Edit ${group.label}`}
                style={styles.group}
                onPress={() => setEditing(index)}
              >
                <View style={styles.groupHead}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  <Text style={styles.groupEdit}>
                    {group.cards.length === group.size ? 'Tap to correct' : `Needs ${group.size - group.cards.length} more`}
                  </Text>
                </View>
                <View style={styles.groupCards}>
                  {Array.from({ length: group.size }, (_, i) => (
                    <PlayingCard key={i} card={group.cards[i]} compact />
                  ))}
                </View>
              </Pressable>
            ))}
            {changed && <Text style={styles.notice}>You corrected some cards.</Text>}
            {groups.length > 0 && (
              <Pressable
                accessibilityLabel="Show winner"
                disabled={!complete}
                style={[styles.winner, !complete && styles.disabled]}
                onPress={showWinner}
              >
                <Ionicons name="trophy" size={20} color={colors.background} />
                <Text style={styles.winnerText}>Confirm and show winner</Text>
              </Pressable>
            )}
          </View>
        )}

        <CardCapture table label={scan ? 'Scan again' : 'Open camera'} onTable={handleTable} />
      </ScrollView>
      {active && editing !== null && (
        <CardPickerModal
          visible
          title={`${active.label}'s cards`}
          limit={active.size}
          selected={active.cards}
          blocked={blockedFor(editing)}
          onChange={(cards) => setGroups((current) => current.map((group, i) => (i === editing ? { ...group, cards } : group)))}
          onClose={() => setEditing(null)}
        />
      )}
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
  compare: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 12 },
  compareDiff: { borderWidth: 1, borderColor: colors.gold },
  compareText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  group: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupLabel: { color: colors.text, fontWeight: '900', fontSize: 15 },
  groupEdit: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  groupCards: { flexDirection: 'row', gap: 8 },
  winner: { height: 56, backgroundColor: colors.primary, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  winnerText: { color: colors.background, fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.35 },
});
