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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 7,
    justifyContent: 'space-between',
    shadowColor: '#171717',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  compact: { width: 50, height: 70, padding: 5 },
  empty: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#c7c7c7',
    shadowOpacity: 0,
    elevation: 0,
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
