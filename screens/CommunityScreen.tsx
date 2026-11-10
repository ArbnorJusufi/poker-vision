import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { CardPickerModal } from '@/components/CardPickerModal';
import { CardCapture } from '@/components/CardCapture';
import { PlayingCard } from '@/components/PlayingCard';
import { useGame } from '@/hooks/GameContext';
import { RecognitionResult } from '@/types/poker';
import { notify } from '@/utils/dialogs';
import { describeConfidence, usableRecognizedCards, validateRecognizedCards } from '@/utils/recognitionValidation';

export function CommunityScreen() {
  const router = useRouter();
  const { community, setCommunity, players } = useGame();
  const [picker, setPicker] = useState(false);
  const blocked = players.flatMap((player) => player.cards);

  const [notice, setNotice] = useState<string | null>(null);

  const handleResult = (result: RecognitionResult) => {
    const error = validateRecognizedCards(result.cards, 5, blocked);
    if (error) {
      const partial = usableRecognizedCards(result.cards, 5, blocked);
      if (partial.length) setCommunity(partial);
      const message = result.message ?? `${error} Complete the selection manually.`;
      setNotice(message);
      notify('Almost there', message);
      setPicker(true);
      return;
    }
    setCommunity(result.cards);
    setNotice(describeConfidence(result.confidence));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.step}>STEP 1 OF 2</Text>
        <Text style={styles.title}>Community cards</Text>
        <Text style={styles.copy}>Photograph all five board cards together, then review the detected cards.</Text>
        <View style={styles.cards}>
          {Array.from({ length: 5 }, (_, index) => <PlayingCard key={index} card={community[index]} onPress={() => setPicker(true)} compact />)}
        </View>
        {notice && <Text style={styles.notice}>{notice}</Text>}
        <CardCapture expectedCount={5} label={community.length === 5 ? 'Retake photo' : 'Take photo'} onResult={handleResult} />
        <Pressable style={styles.manual} onPress={() => setPicker(true)}>
          <Ionicons name="grid-outline" size={19} color={colors.text} /><Text style={styles.manualText}>Enter cards manually</Text>
        </Pressable>
        <Pressable
          disabled={community.length !== 5}
          style={[styles.continue, community.length !== 5 && styles.disabled]}
          onPress={() => router.push('/players')}
        >
          <Text style={styles.continueText}>Continue to players</Text><Ionicons name="arrow-forward" size={20} color={colors.background} />
        </Pressable>
      </ScrollView>
      <CardPickerModal
        visible={picker} title="Select community cards" limit={5} selected={community}
        blocked={blocked} onChange={setCommunity} onClose={() => setPicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { ...contentWidth, padding: 22, paddingBottom: 40 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  step: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 8 },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 25 },
  cards: { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 22, borderRadius: 18, marginBottom: 20 },
  notice: { color: colors.textMuted, backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 14, lineHeight: 19 },
  manual: { minHeight: 52, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  manualText: { color: colors.text, fontWeight: '700' },
  continue: { height: 56, backgroundColor: colors.primary, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 15 },
  continueText: { color: colors.background, fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.35 },
});
