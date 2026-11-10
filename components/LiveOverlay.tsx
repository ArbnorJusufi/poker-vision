import { StyleSheet, Text, View } from 'react-native';
import { overlay } from '@/constants/theme';
import { LiveCard, LiveState } from '@/services/recognition/live';
import { coverTransform, mapBox } from '@/services/recognition/liveGeometry';
import { codeToCard } from '@/services/recognition/yolo';

const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const;

export const LIVE_COLORS: Record<LiveState, string> = {
  confident: overlay.good,
  uncertain: overlay.warn,
  failed: overlay.bad,
};

export function cardLabel(code: string): string {
  const card = codeToCard(code);
  return `${card.rank}${symbols[card.suit]}`;
}

interface Props {
  cards: LiveCard[];
  frame: { width: number; height: number };
  view: { width: number; height: number };
}

/** Bounding boxes and card values drawn over the live preview. */
export function LiveOverlay({ cards, frame, view }: Props) {
  if (!view.width || !view.height || !frame.width) return null;
  const transform = coverTransform(frame.width, frame.height, view.width, view.height);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cards.map((card) => {
        const box = mapBox(card.box, transform);
        const color = LIVE_COLORS[card.state];
        return (
          <View
            key={card.code}
            accessibilityLabel={`Detected ${card.code} ${card.state}`}
            style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height, borderColor: color }]}
          >
            <View style={[styles.label, { backgroundColor: color }]}>
              <Text style={styles.labelText}>
                {card.state === 'failed' ? '?' : cardLabel(card.code)} {Math.round(card.confidence * 100)}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderWidth: 3, borderRadius: 6 },
  label: {
    position: 'absolute', top: -22, left: -3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    minWidth: 44, alignItems: 'center',
  },
  labelText: { color: overlay.onColor, fontSize: 11, fontWeight: '900' },
});
