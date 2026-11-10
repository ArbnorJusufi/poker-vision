import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, overlay, shadow } from '@/constants/theme';

const LAYOUT = require('../assets/table-layout.jpg');
const ASPECT = 1024 / 682;

/** Where each label sits on the example photo, as a share of its width and height. */
const TAGS = [
  { label: 'BOARD', x: 0.5, y: 0.325 },
  { label: 'HAND', x: 0.21, y: 0.325 },
  { label: 'HAND', x: 0.8, y: 0.325 },
  { label: 'HAND', x: 0.21, y: 0.63 },
  { label: 'HAND', x: 0.81, y: 0.63 },
];

export const LAYOUT_TIPS = [
  'Put the five board cards in one straight row in the middle.',
  "Place each player's two cards side by side, with clear space around every hand.",
  'Do not overlap cards: the rank and suit in the corner of each one must stay visible.',
  'Shoot from straight above, in landscape, with the whole table in the frame.',
  'Use even light on a plain surface, without glare or shadows, and hold steady until the counter turns green.',
];

/** The example photo with the board and hands labelled. */
export function LayoutExample({ radiusSize = 14 }: { radiusSize?: number }) {
  return (
    <View style={[styles.frame, { borderRadius: radiusSize }]}>
      <Image accessibilityLabel="Example of a well laid out table" source={LAYOUT} style={styles.image} resizeMode="cover" />
      {TAGS.map((tag, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[styles.tagWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
        >
          <Text style={[styles.tag, tag.label === 'BOARD' && styles.tagBoard]}>{tag.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Card shown on the table screen: the example photo and the layout rules that give the best recognition. */
export function TableLayoutGuide() {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="grid-outline" size={18} color={colors.primary} />
        <Text accessibilityRole="header" style={styles.title}>Lay out the table like this</Text>
      </View>
      <LayoutExample />
      <View style={styles.tips}>
        {LAYOUT_TIPS.map((tip) => (
          <View key={tip} style={styles.tip}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 14, marginBottom: 16, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  frame: { width: '100%', aspectRatio: ASPECT, overflow: 'hidden', backgroundColor: '#0b5d1e' },
  image: { width: '100%', height: '100%' },
  tagWrap: { position: 'absolute', width: 52, marginLeft: -26, marginTop: -8 },
  tag: {
    color: overlay.text, backgroundColor: overlay.scrim, fontSize: 9, fontWeight: '900', letterSpacing: 1,
    paddingVertical: 2, borderRadius: 999, overflow: 'hidden', textAlign: 'center',
  },
  tagBoard: { backgroundColor: colors.primary },
  tips: { gap: 9 },
  tip: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  tipText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
});
