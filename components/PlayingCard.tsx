import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/types/poker';
import { colors } from '@/constants/theme';

const suitSymbols: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

interface Props {
  card?: Card;
  onPress?: () => void;
  compact?: boolean;
}

export function PlayingCard({ card, onPress, compact }: Props) {
  const red = card?.suit === 'hearts' || card?.suit === 'diamonds';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={card ? `${card.rank} of ${card.suit}` : 'Empty card slot'}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.card, compact && styles.compact, !card && styles.empty]}
    >
      {card ? (
        <View>
          <Text style={[styles.rank, compact && styles.compactRank, red && styles.red]}>{card.rank}</Text>
          <Text style={[styles.suit, compact && styles.compactSuit, red && styles.red]}>{suitSymbols[card.suit]}</Text>
        </View>
      ) : <Text style={styles.plus}>+</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 62,
    height: 88,
    borderRadius: 10,
    backgroundColor: '#f8faf8',
    padding: 8,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  compact: { width: 50, height: 70, padding: 6 },
  empty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rank: { fontSize: 23, fontWeight: '800', color: colors.blackSuit, lineHeight: 25 },
  suit: { fontSize: 26, color: colors.blackSuit, lineHeight: 28 },
  compactRank: { fontSize: 18, lineHeight: 20 },
  compactSuit: { fontSize: 20, lineHeight: 22 },
  red: { color: colors.redSuit },
  plus: { color: colors.textMuted, fontSize: 25 },
});
