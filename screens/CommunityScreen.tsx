import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { CardPickerModal } from '@/components/CardPickerModal';
import { CardCapture } from '@/components/CardCapture';
import { PlayingCard } from '@/components/PlayingCard';
import { useGame } from '@/hooks/GameContext';

export function CommunityScreen() {
  const router = useRouter();
  const { community, setCommunity, players } = useGame();
  const [picker, setPicker] = useState(false);
  const blocked = players.flatMap((player) => player.cards);

  const openManual = (message?: string) => {
    if (message) Alert.alert('Manual review required', message);
    setPicker(true);
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
        <CardCapture expectedCount={5} onManualEntry={openManual} />
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
  container: { padding: 22, paddingBottom: 40 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  step: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 8 },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 25 },
  cards: { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 22, borderRadius: 18, marginBottom: 20 },
  manual: { minHeight: 52, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  manualText: { color: colors.text, fontWeight: '700' },
  continue: { height: 56, backgroundColor: colors.primary, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 15 },
  continueText: { color: colors.background, fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.35 },
});
