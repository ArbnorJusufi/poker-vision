import { useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { overlay } from '@/constants/theme';
import { PositionedCard, TableLayout } from '@/types/poker';

interface Props {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  cards: PositionedCard[];
  layout: TableLayout | null;
}

const PLAYER_COLORS = ['#f6c453', '#5cc8ff', '#ff8fb1', '#b69cff', '#ff9f5c', '#7be3d1', '#e0e26b', '#ff6b6b'];

function groupOf(card: PositionedCard, layout: TableLayout | null): { label: string; color: string } {
  if (!layout?.ok) return { label: '', color: overlay.good };
  if (layout.community.includes(card)) return { label: 'Board', color: overlay.good };
  if (layout.dropped.includes(card)) return { label: 'Ignored', color: overlay.bad };
  const index = layout.players.findIndex((hand) => hand.includes(card));
  return { label: `P${index + 1}`, color: PLAYER_COLORS[index % PLAYER_COLORS.length] };
}

/** The photo with every detected card marked and labelled by the group it was assigned to. */
export function TableOverlay({ uri, imageWidth, imageHeight, cards, layout }: Props) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => setBox(event.nativeEvent.layout);

  const ready = box.width > 0 && imageWidth > 0 && imageHeight > 0;
  const scale = ready ? Math.min(box.width / imageWidth, box.height / imageHeight) : 1;
  const offsetX = (box.width - imageWidth * scale) / 2;
  const offsetY = (box.height - imageHeight * scale) / 2;

  return (
    <View style={styles.frame} onLayout={onLayout}>
      <Image accessibilityLabel="Table photo" source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {ready && cards.map((card) => {
        const { label, color } = groupOf(card, layout);
        return (
          <View
            key={card.code}
            pointerEvents="none"
            style={[styles.tag, { left: offsetX + card.x * scale - 22, top: offsetY + card.y * scale - 11, borderColor: color }]}
          >
            <Text style={[styles.tagText, { color }]}>{card.code}</Text>
            {label ? <Text style={[styles.tagGroup, { backgroundColor: color }]}>{label}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
  tag: {
    position: 'absolute', minWidth: 44, height: 22, borderRadius: 8, borderWidth: 2,
    backgroundColor: overlay.scrim, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 3,
  },
  tagText: { fontSize: 11, fontWeight: '900' },
  tagGroup: { fontSize: 9, fontWeight: '900', color: overlay.onColor, paddingHorizontal: 3, borderRadius: 4, overflow: 'hidden' },
});
