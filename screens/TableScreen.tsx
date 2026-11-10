import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/constants/theme';
import { AppHeader } from '@/components/AppHeader';
import { AiCheck } from '@/components/AiCheck';
import { Button, ScreenTitle } from '@/components/ui';
import { useAiReading } from '@/hooks/useAiReading';
import { compareTable, usableTable } from '@/services/ai/agreement';
import { contentWidth } from '@/constants/layout';
import { CardCapture } from '@/components/CardCapture';
import { CardPickerModal } from '@/components/CardPickerModal';
import { PlayingCard } from '@/components/PlayingCard';
import { TableOverlay } from '@/components/TableOverlay';
import { useGame } from '@/hooks/GameContext';
import { Card, TableDetection, TableLayout } from '@/types/poker';
import { cardKey } from '@/utils/cardValidation';
import { LiveComparison, compareRecognition } from '@/utils/liveComparison';
import { TABLE_REVIEW_CONFIDENCE, groupTable, lowConfidenceCards } from '@/utils/tableLayout';

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
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set());
  const ai = useAiReading(scan?.uri ?? null, { kind: 'table' });

  const handleTable = (detection: TableDetection, uri: string, seenLive: string[]) => {
    const layout: TableLayout = detection.cards.length
      ? groupTable(detection.cards)
      : { ok: false, community: [], players: [], dropped: [], message: detection.message ?? 'No cards were detected.' };
    const used = layout.ok ? [...layout.community, ...layout.players.flat()].map((card) => card.code) : [];
    setScan({ uri, detection, layout, comparison: seenLive.length ? compareRecognition(seenLive, used) : null });
    setGroups(groupsFrom(layout));
    setAiKeys(new Set());
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
  const readingFor = (card: Card) => {
    const found = layout?.ok
      ? [...layout.community, ...layout.players.flat()].find((candidate) => cardKey(candidate.card) === cardKey(card))
      : undefined;
    if (aiKeys.has(cardKey(card))) return { text: 'AI', tone: colors.textMuted };
    if (!found) return { text: 'set by you', tone: colors.textMuted };
    const percent = Math.round(found.confidence * 100);
    const tone = found.confidence >= 0.8 ? colors.successText : found.confidence >= TABLE_REVIEW_CONFIDENCE ? colors.goldText : colors.danger;
    return { text: `${percent}%`, tone };
  };
  const active = editing === null ? null : groups[editing];
  const changed = !!layout?.ok && groups.some((group, i) => {
    const original = i === 0 ? layout.community : layout.players[i - 1];
    return group.cards.length !== original.length
      || group.cards.some((card) => !original.some((found) => cardKey(found.card) === cardKey(card)));
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenTitle
          kicker="One photo"
          title="Scan the table"
          copy="Point the camera at the board and every player's two cards. Cards are recognised live as you move; capture when the table is recognised, then check the result before the winner is shown."
        />

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
                  color={scan.comparison.identical ? colors.success : colors.gold}
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

            {ai.connection && (
              <AiCheck connection={ai.connection} state={ai.state} onRun={ai.run} onStop={ai.stop}>
                {ai.state.status === 'done' && (() => {
                  const reading = ai.state.reading;
                  const aiGroups = reading.cards.length || reading.players.length ? [reading.cards, ...reading.players] : [];
                  const agreement = compareTable(groups.map((group) => group.cards), aiGroups);
                  const usable = usableTable(aiGroups);
                  return (
                    <View style={[styles.aiResult, agreement.agree && styles.aiSame]}>
                      <View style={styles.aiHead}>
                        <Ionicons
                          name={agreement.agree ? 'checkmark-circle' : 'sparkles'} size={18}
                          color={agreement.agree ? colors.success : colors.primary}
                        />
                        <Text style={styles.aiSummary}>
                          {aiGroups.length ? agreement.summary : 'The AI could not find any cards in this photo.'}
                        </Text>
                      </View>
                      {!agreement.agree && aiGroups.length > 0 && (
                        <Text style={styles.aiDetail}>
                          {usable
                            ? `It reads a board and ${aiGroups.length - 1} player${aiGroups.length === 2 ? '' : 's'}.`
                            : 'Its reading is incomplete, so it cannot replace yours. Use it as a hint when correcting.'}
                        </Text>
                      )}
                      {!agreement.agree && usable && (
                        <Button
                          label="Use the AI's reading" icon="swap-horizontal" variant="secondary"
                          onPress={() => {
                            setGroups(aiGroups.map((cards, i) => ({
                              label: i === 0 ? 'Board' : `Player ${i}`, size: i === 0 ? BOARD_SIZE : HAND_SIZE, cards,
                            })));
                            setAiKeys(new Set(aiGroups.flat().map(cardKey)));
                          }}
                        />
                      )}
                    </View>
                  );
                })()}
              </AiCheck>
            )}

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
                  {Array.from({ length: group.size }, (_, i) => {
                    const reading = group.cards[i] ? readingFor(group.cards[i]) : null;
                    return (
                      <View key={i} style={styles.groupCard}>
                        <PlayingCard card={group.cards[i]} compact />
                        {reading && (
                          <Text
                            accessibilityLabel={`Confidence ${reading.text}`}
                            style={[styles.reading, { color: reading.tone }]}
                          >
                            {reading.text}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            ))}
            {aiKeys.size > 0 && <Text style={styles.notice}>The AI's reading is in use. Check it against the photo.</Text>}
            {changed && aiKeys.size === 0 && <Text style={styles.notice}>You corrected some cards.</Text>}
            {groups.length > 0 && (
              <Button
                label="Confirm and show winner" icon="trophy" accessibilityLabel="Show winner"
                disabled={!complete} onPress={showWinner}
              />
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
  container: { ...contentWidth, padding: 20, paddingBottom: 40 },
  scan: { gap: 12, marginBottom: 20 },
  summary: { color: colors.text, fontWeight: '700', fontSize: 15, lineHeight: 21 },
  problem: { color: colors.danger },
  notice: { color: colors.textMuted, backgroundColor: colors.surface, padding: 12, borderRadius: 12, lineHeight: 19, borderWidth: 1, borderColor: colors.border },
  compare: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  compareDiff: { borderWidth: 1, borderColor: colors.gold },
  compareText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  group: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border, ...shadow },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupLabel: { color: colors.text, fontWeight: '900', fontSize: 15 },
  groupEdit: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  groupCards: { flexDirection: 'row', gap: 8 },
  groupCard: { alignItems: 'center', gap: 4 },
  reading: { fontSize: 11, fontWeight: '800' },
  aiResult: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, padding: 14, gap: 12 },
  aiSame: { borderColor: colors.success },
  aiHead: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  aiSummary: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  aiDetail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
