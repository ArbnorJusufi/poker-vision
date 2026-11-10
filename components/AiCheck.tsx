import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { AiState } from '@/hooks/useAiReading';
import { PROVIDERS, AiConnection } from '@/services/ai/types';
import { Button } from './ui';

interface Props {
  connection: AiConnection;
  state: AiState;
  onRun: () => void;
  onStop: () => void;
  /** Rendered when the AI answered: the comparison and the "use it" action. */
  children?: ReactNode;
}

/** The "Check with AI" control: a button, then progress, a readable error, or the answer supplied by the caller. */
export function AiCheck({ connection, state, onRun, onStop, children }: Props) {
  const provider = PROVIDERS[connection.provider].label;
  return (
    <View style={styles.box}>
      {state.status === 'loading' ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={styles.text}>Asking {provider}…</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel AI check" onPress={onStop} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {state.status === 'error' && (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{state.message}</Text>
            </View>
          )}
          {state.status === 'done' && children}
          <Button
            label={state.status === 'idle' ? 'Check with AI' : 'Check again'}
            icon="sparkles"
            variant="outline"
            onPress={onRun}
          />
          {state.status === 'idle' && <Text style={styles.note}>Sends this photo to {provider}.</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  text: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 14 },
  cancel: { color: colors.textMuted, fontWeight: '800', fontSize: 14 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#fdecec', borderRadius: 12, padding: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
