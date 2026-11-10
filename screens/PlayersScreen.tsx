import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { useGame } from '@/hooks/GameContext';
import { CardPickerModal } from '@/components/CardPickerModal';
import { PlayingCard } from '@/components/PlayingCard';
import { CardCapture } from '@/components/CardCapture';
import { validateGame } from '@/utils/cardValidation';

export function PlayersScreen() {
  const router = useRouter();
  const { community, players, addPlayer, updatePlayer, removePlayer } = useGame();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = players.find((player) => player.id === editingId);
  const blocked = [
    ...community,
    ...players.filter((player) => player.id !== editingId).flatMap((player) => player.cards),
  ];

  const calculate = () => {
    const error = validateGame(community, players);
    if (error) Alert.alert('Game is not ready', error);
    else router.push('/results');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></Pressable>
          <Text style={styles.step}>STEP 2 OF 2</Text>
        </View>
        <Text style={styles.title}>Players</Text>
        <Text style={styles.copy}>Add every player in the showdown and capture their two private cards.</Text>
        {players.map((player, index) => (
          <View key={player.id} style={styles.player}>
            <View style={styles.playerHead}>
              <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
              <TextInput
                value={player.name} onChangeText={(name) => updatePlayer(player.id, { name })}
                style={styles.name} placeholder="Player name" placeholderTextColor={colors.textMuted}
              />
              <Pressable accessibilityLabel={`Remove ${player.name}`} onPress={() => removePlayer(player.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
            <View style={styles.cardRow}>
              <PlayingCard card={player.cards[0]} compact onPress={() => setEditingId(player.id)} />
              <PlayingCard card={player.cards[1]} compact onPress={() => setEditingId(player.id)} />
              <View style={styles.captureWrap}>
                <CardCapture expectedCount={2} onManualEntry={(message) => {
                  if (message) Alert.alert('Manual review required', message);
                  setEditingId(player.id);
                }} />
              </View>
            </View>
            <Pressable onPress={() => setEditingId(player.id)}><Text style={styles.manual}>Select or correct cards manually</Text></Pressable>
          </View>
        ))}
        <Pressable style={styles.add} onPress={addPlayer}>
          <Ionicons name="add-circle-outline" size={23} color={colors.primary} /><Text style={styles.addText}>Add player</Text>
        </Pressable>
        <Pressable style={styles.calculate} onPress={calculate}>
          <Ionicons name="sparkles" size={20} color={colors.background} /><Text style={styles.calculateText}>Calculate winner</Text>
        </Pressable>
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
  container: { padding: 22, paddingBottom: 40 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  step: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900' },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  player: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  number: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.primary, fontWeight: '800' },
  name: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800', paddingVertical: 5 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  captureWrap: { flex: 1 },
  manual: { color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 11 },
  add: { height: 56, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  calculate: { height: 58, borderRadius: 16, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 },
  calculateText: { color: colors.background, fontSize: 17, fontWeight: '900' },
});
