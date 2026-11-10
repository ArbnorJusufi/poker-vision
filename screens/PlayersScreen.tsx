import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/AppHeader';
import { Button, ScreenTitle } from '@/components/ui';
import { colors, shadow } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { useGame } from '@/hooks/GameContext';
import { CardPickerModal } from '@/components/CardPickerModal';
import { PlayingCard } from '@/components/PlayingCard';
import { CardCapture } from '@/components/CardCapture';
import { validateGame } from '@/utils/cardValidation';
import { RecognitionResult } from '@/types/poker';
import { confirmAction, notify } from '@/utils/dialogs';
import { usableRecognizedCards, validateRecognizedCards } from '@/utils/recognitionValidation';

export function PlayersScreen() {
  const router = useRouter();
  const { community, players, addPlayer, updatePlayer, removePlayer } = useGame();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = players.find((player) => player.id === editingId);
  const blocked = [
    ...community,
    ...players.filter((player) => player.id !== editingId).flatMap((player) => player.cards),
  ];

  const handleResult = (playerId: string, result: RecognitionResult) => {
    const others = [
      ...community,
      ...players.filter((player) => player.id !== playerId).flatMap((player) => player.cards),
    ];
    const error = validateRecognizedCards(result.cards, 2, others);
    if (error) {
      updatePlayer(playerId, { cards: usableRecognizedCards(result.cards, 2, others) });
      notify('Almost there', result.message ?? `${error} Complete the selection manually.`);
      setEditingId(playerId);
      return;
    }
    updatePlayer(playerId, { cards: result.cards });
  };

  const remove = (id: string, name: string) =>
    confirmAction('Remove player', `Remove ${name} from this game?`, 'Remove', () => removePlayer(id));

  const calculate = () => {
    const error = validateGame(community, players);
    if (error) notify('Game is not ready', error);
    else router.push('/results');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenTitle kicker="Step 2 of 2" title="Players" copy="Add every player in the showdown and capture their two private cards." />
        {players.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={34} color={colors.textMuted} />
            <Text style={styles.emptyText}>No players yet. Add the first player to begin.</Text>
          </View>
        )}
        {players.map((player, index) => (
          <View key={player.id} style={styles.player}>
            <View style={styles.playerHead}>
              <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
              <TextInput
                value={player.name} onChangeText={(name) => updatePlayer(player.id, { name })}
                style={styles.name} placeholder="Player name" placeholderTextColor={colors.textMuted}
              />
              <Pressable accessibilityLabel={`Remove ${player.name}`} onPress={() => remove(player.id, player.name)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
            <View style={styles.cardRow}>
              <PlayingCard card={player.cards[0]} compact onPress={() => setEditingId(player.id)} />
              <PlayingCard card={player.cards[1]} compact onPress={() => setEditingId(player.id)} />
              <View style={styles.captureWrap}>
                <CardCapture
                  expectedCount={2}
                  confirmTitle={`${player.name}'s cards`}
                  blocked={[
                    ...community,
                    ...players.filter((other) => other.id !== player.id).flatMap((other) => other.cards),
                  ]}
                  label={player.cards.length === 2 ? 'Retake' : 'Take photo'}
                  onResult={(result) => handleResult(player.id, result)}
                />
              </View>
            </View>
            <Pressable onPress={() => setEditingId(player.id)}><Text style={styles.manual}>Select or correct cards manually</Text></Pressable>
          </View>
        ))}
        <Button label="Add player" icon="add-circle-outline" variant="outline" onPress={addPlayer} />
        <Button label="Calculate winner" icon="trophy" onPress={calculate} style={styles.calculate} />
      </ScrollView>
      {editing && (
        <CardPickerModal
          visible title={`${editing.name}'s cards`} limit={2} selected={editing.cards} blocked={blocked}
          onChange={(cards) => updatePlayer(editing.id, { cards })} onClose={() => setEditingId(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { ...contentWidth, padding: 20, paddingBottom: 40 },
  player: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border, ...shadow },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  number: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.onPrimary, fontWeight: '800' },
  name: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800', paddingVertical: 5 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  captureWrap: { flex: 1 },
  manual: { color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 11 },
  empty: { alignItems: 'center', gap: 10, padding: 30, marginBottom: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c7c7c7', backgroundColor: colors.surface },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
  calculate: { marginTop: 12 },
});
