import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/AppHeader';
import { Button, ScreenTitle } from '@/components/ui';
import { colors, shadow } from '@/constants/theme';
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenTitle kicker="Step 1 of 2" title="Community cards" copy="Photograph all five board cards together, then review the detected cards." />
        <View style={styles.cards}>
          {Array.from({ length: 5 }, (_, index) => <PlayingCard key={index} card={community[index]} onPress={() => setPicker(true)} compact />)}
        </View>
        {notice && <Text style={styles.notice}>{notice}</Text>}
        <CardCapture
          expectedCount={5} blocked={blocked} confirmTitle="Community cards"
          label={community.length === 5 ? 'Retake photo' : 'Take photo'} onResult={handleResult}
        />
        <Pressable style={styles.manual} onPress={() => setPicker(true)}>
          <Ionicons name="grid-outline" size={19} color={colors.text} /><Text style={styles.manualText}>Enter cards manually</Text>
        </Pressable>
        <Button
          label="Continue to players" trailingIcon="arrow-forward" disabled={community.length !== 5}
          onPress={() => router.push('/players')} style={styles.continue}
        />
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
  container: { ...contentWidth, padding: 20, paddingBottom: 40 },
  cards: { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 22, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...shadow },
  notice: { color: colors.textMuted, backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 14, lineHeight: 19, borderWidth: 1, borderColor: colors.border },
  manual: { minHeight: 52, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  manualText: { color: colors.text, fontWeight: '700' },
  continue: { marginTop: 8 },
});
