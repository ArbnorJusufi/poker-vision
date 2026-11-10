import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/constants/theme';
import { useAiReading } from '@/hooks/useAiReading';
import { compareGroup } from '@/services/ai/agreement';
import { validateRecognizedCards } from '@/utils/recognitionValidation';
import { AiCheck } from './AiCheck';
import { Button, Kicker } from './ui';
import { Card, RecognitionResult } from '@/types/poker';
import { cardToCode } from '@/services/recognition/yolo';
import { cardKey } from '@/utils/cardValidation';
import { LiveComparison } from '@/utils/liveComparison';
import { CardPickerModal } from './CardPickerModal';
import { PlayingCard } from './PlayingCard';
import { cardLabel } from './LiveOverlay';

interface Props {
  photoUri: string;
  result: RecognitionResult;
  expectedCount: number;
  comparison: LiveComparison | null;
  /** Cards that cannot be chosen because another hand already holds them. */
  blocked: Card[];
  title: string;
  onConfirm: (result: RecognitionResult) => void;
  onRetake: () => void;
}

const codeOf = cardToCode;

/** Shown after a capture: the final reading next to the photo, with the live comparison and manual correction. */
export function RecognitionConfirmation({
  photoUri, result, expectedCount, comparison, blocked, title, onConfirm, onRetake,
}: Props) {
  const [cards, setCards] = useState<Card[]>(result.cards.slice(0, expectedCount));
  const [picking, setPicking] = useState(false);
  const confidenceOf = new Map(result.cards.map((card, i) => [cardKey(card), result.confidences?.[i]]));
  const edited = cards.length !== result.cards.length || cards.some((card) => !confidenceOf.has(cardKey(card)));
  const complete = cards.length === expectedCount;
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set());
  const ai = useAiReading(photoUri, { kind: 'cards', expected: expectedCount });
  const live = new Set(comparison?.agreed ?? []);
  const liveSeen = !!comparison && comparison.agreed.length + comparison.onlyLive.length > 0;

  const confirm = () =>
    onConfirm({
      cards,
      confidences: cards.map((card) => confidenceOf.get(cardKey(card)) ?? 1),
      confidence: edited ? undefined : result.confidence,
      source: edited ? 'manual' : result.source,
      message: result.message,
    });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Kicker>Check the cards</Kicker>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Image accessibilityLabel="Captured photo" source={{ uri: photoUri }} style={styles.photo} resizeMode="contain" />

        <View style={styles.cards}>
          {Array.from({ length: expectedCount }, (_, index) => {
            const card = cards[index];
            const confidence = card ? confidenceOf.get(cardKey(card)) : undefined;
            const fromAi = !!card && aiKeys.has(cardKey(card));
            const tone = !card ? colors.border : confidence === undefined ? (fromAi ? colors.textMuted : colors.success)
              : confidence >= 0.6 ? colors.success : confidence >= 0.35 ? colors.gold : colors.danger;
            const note = !card ? 'missing'
              : fromAi ? 'AI'
              : confidence === undefined ? 'set by you'
                : liveSeen ? (live.has(codeOf(card)) ? 'seen live' : 'photo only')
                  : `${Math.round(confidence * 100)}%`;
            return (
              <View key={index} style={styles.slot}>
                <PlayingCard card={card} compact onPress={() => setPicking(true)} />
                <View style={[styles.dot, { backgroundColor: tone }]} />
                <Text style={styles.note}>{note}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.status, complete ? styles.ok : styles.warn]}>
          {complete
            ? `${cards.map((card) => cardLabel(codeOf(card))).join('  ')}`
            : `${cards.length} of ${expectedCount} cards. Tap a card slot to add the missing ones.`}
        </Text>
        {comparison && (
          <View style={[styles.compare, !comparison.identical && styles.compareDiff]}>
            <Ionicons
              name={comparison.identical ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={comparison.identical ? colors.success : colors.gold}
            />
            <Text style={styles.compareText}>{comparison.summary}</Text>
          </View>
        )}
        {result.message && !complete && <Text style={styles.message}>{result.message}</Text>}

        {ai.connection && (
          <View style={styles.ai}>
            <AiCheck connection={ai.connection} state={ai.state} onRun={ai.run} onStop={ai.stop}>
              {ai.state.status === 'done' && (() => {
                const reading = ai.state.reading;
                const agreement = compareGroup(cards, reading.cards);
                const problem = validateRecognizedCards(reading.cards, expectedCount, blocked);
                const same = agreement.agree;
                return (
                  <View style={[styles.aiResult, same && styles.aiSame]}>
                    <View style={styles.aiHead}>
                      <Ionicons name={same ? 'checkmark-circle' : 'sparkles'} size={18} color={same ? colors.success : colors.primary} />
                      <Text style={styles.aiSummary}>{agreement.summary}</Text>
                    </View>
                    {!same && reading.cards.length > 0 && (
                      <View style={styles.aiCards}>{reading.cards.map((card) => <PlayingCard key={cardKey(card)} card={card} compact />)}</View>
                    )}
                    {!same && problem && <Text style={styles.aiProblem}>{problem} Correct the cards by hand instead.</Text>}
                    {!same && !problem && (
                      <Button
                        label="Use the AI's reading" icon="swap-horizontal" variant="secondary"
                        onPress={() => { setCards(reading.cards); setAiKeys(new Set(reading.cards.map(cardKey))); }}
                      />
                    )}
                  </View>
                );
              })()}
            </AiCheck>
          </View>
        )}

        <Button label="Correct cards" icon="create-outline" variant="outline" onPress={() => setPicking(true)} accessibilityLabel="Edit cards" style={styles.edit} />
        <Button label="Confirm cards" icon="checkmark" disabled={!complete} onPress={confirm} accessibilityLabel="Confirm cards" style={styles.confirm} />
        <Pressable accessibilityLabel="Retake photo" style={styles.retake} onPress={onRetake}>
          <Text style={styles.retakeText}>Retake photo</Text>
        </Pressable>
      </ScrollView>
      <CardPickerModal
        visible={picking} title={title} limit={expectedCount} selected={cards}
        blocked={blocked} onChange={setCards} onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 6, marginBottom: 14 },
  photo: { width: '100%', height: 190, borderRadius: 14, backgroundColor: '#000' },
  cards: { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 18, borderRadius: 16, marginTop: 14, borderWidth: 1, borderColor: colors.border, ...shadow },
  slot: { alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  note: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  status: { fontSize: 15, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  ok: { color: colors.successText },
  warn: { color: colors.goldText },
  compare: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  compareDiff: { borderWidth: 1, borderColor: colors.gold },
  compareText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  message: { color: colors.textMuted, marginTop: 10, lineHeight: 19 },
  edit: { marginTop: 16 },
  confirm: { marginTop: 12 },
  ai: { marginTop: 16 },
  aiResult: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, padding: 14, gap: 12 },
  aiSame: { borderColor: colors.success },
  aiHead: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  aiSummary: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  aiCards: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  aiProblem: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  retake: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retakeText: { color: colors.textMuted, fontWeight: '700' },
});
