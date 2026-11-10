import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Card, RANKS, SUITS } from '@/types/poker';
import { PlayingCard } from './PlayingCard';

interface Props {
  visible: boolean;
  selected: Card[];
  blocked: Card[];
  limit: number;
  title: string;
  onChange: (cards: Card[]) => void;
  onClose: () => void;
}

const key = (card: Card) => `${card.rank}-${card.suit}`;

export function CardPickerModal({ visible, selected, blocked, limit, title, onChange, onClose }: Props) {
  const blockedKeys = new Set(blocked.map(key));
  const selectedKeys = new Set(selected.map(key));
  const toggle = (card: Card) => {
    const value = key(card);
    if (selectedKeys.has(value)) onChange(selected.filter((item) => key(item) !== value));
    else if (selected.length < limit && !blockedKeys.has(value)) onChange([...selected, card]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{selected.length} of {limit} selected</Text>
          </View>
          <Pressable onPress={onClose} disabled={selected.length !== limit}>
            <Text style={[styles.done, selected.length !== limit && styles.disabled]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {SUITS.map((suit) => (
            <View key={suit}>
              <Text style={styles.suitTitle}>{suit}</Text>
              <View style={styles.grid}>
                {RANKS.map((rank) => {
                  const card: Card = { rank, suit };
                  const isBlocked = blockedKeys.has(key(card));
                  const isSelected = selectedKeys.has(key(card));
                  return (
                    <Pressable
                      key={rank}
                      disabled={isBlocked}
                      onPress={() => toggle(card)}
                      style={[styles.option, isSelected && styles.selected, isBlocked && styles.blocked]}
                    >
                      <PlayingCard card={card} compact />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  header: {
    padding: 20, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: 4 },
  done: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  content: { padding: 16, paddingBottom: 40 },
  suitTitle: { color: colors.text, fontWeight: '700', fontSize: 16, textTransform: 'capitalize', marginVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.primary },
  blocked: { opacity: 0.18 },
});
