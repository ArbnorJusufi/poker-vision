import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { contentWidth } from '@/constants/layout';
import { AppHeader } from '@/components/AppHeader';
import { Button, Panel, ScreenTitle } from '@/components/ui';
import { useAiConnection } from '@/hooks/useAiConnection';
import { testConnection } from '@/services/ai';
import { startOpenRouterSignIn } from '@/services/ai/openRouterAuth';
import { clearConnection, saveConnection } from '@/services/ai/storage';
import { AiConnection, AiProvider, KEY_PROVIDERS, PROVIDERS } from '@/services/ai/types';
import { confirmAction } from '@/utils/dialogs';

const isWeb = Platform.OS === 'web';

export function AiScreen() {
  const router = useRouter();
  const connection = useAiConnection();
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<'key' | 'signin' | 'test' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<string | null>(null);

  const info = PROVIDERS[provider];

  const signIn = async () => {
    setProblem(null);
    setBusy('signin');
    try {
      await startOpenRouterSignIn();
    } catch {
      setProblem('Could not start the sign-in. Try again, or paste an API key instead.');
      setBusy(null);
    }
  };

  const connectKey = async () => {
    const next: AiConnection = { provider, apiKey: apiKey.trim(), model: model.trim() || info.defaultModel, method: 'key' };
    if (!next.apiKey) {
      setProblem('Paste your API key first.');
      return;
    }
    setProblem(null);
    setBusy('key');
    try {
      await testConnection(next);
      saveConnection(next);
      setApiKey('');
      setModel('');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not connect.');
    } finally {
      setBusy(null);
    }
  };

  const retest = async () => {
    if (!connection) return;
    setTested(null);
    setProblem(null);
    setBusy('test');
    try {
      await testConnection(connection);
      setTested('Connection works.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not connect.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () =>
    confirmAction('Disconnect AI', 'This removes the saved key from this device.', 'Disconnect', () => {
      clearConnection();
      setTested(null);
      setProblem(null);
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader hideAi onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          kicker="Optional"
          title="AI second opinion"
          copy="Poker Vision reads cards on your device. Connect your own AI account to double-check hard photos, such as blurry shots or unusual card designs."
        />

        {problem && (
          <View accessibilityLiveRegion="polite" style={styles.problem}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.problemText}>{problem}</Text>
          </View>
        )}

        {connection ? (
          <Panel style={styles.gap}>
            <View style={styles.connectedHead}>
              <View style={styles.dot} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Connected with {PROVIDERS[connection.provider].label}</Text>
                <Text style={styles.muted}>{connection.method === 'signin' ? 'Signed in' : 'Your own API key'} · stays on this device</Text>
              </View>
            </View>
            <Text style={styles.label}>Model</Text>
            <TextInput
              accessibilityLabel="Model"
              value={modelDraft ?? connection.model}
              onChangeText={setModelDraft}
              onBlur={() => {
                if (modelDraft === null) return;
                saveConnection({ ...connection, model: modelDraft.trim() || PROVIDERS[connection.provider].defaultModel });
                setModelDraft(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {tested && <Text style={styles.ok}>{tested}</Text>}
            <Button label="Test connection" icon="pulse-outline" variant="outline" loading={busy === 'test'} onPress={retest} />
            <Button label="Disconnect" icon="log-out-outline" variant="secondary" onPress={disconnect} />
          </Panel>
        ) : (
          <>
            <Panel style={styles.gap}>
              <View style={styles.badgeRow}>
                <Text style={styles.cardTitle}>Sign in with OpenRouter</Text>
                <View style={styles.recommended}><Text style={styles.recommendedText}>EASIEST</Text></View>
              </View>
              <Text style={styles.muted}>
                One sign-in, then use Claude, GPT or Gemini vision models. Usage is billed to your own OpenRouter credits,
                so there is nothing to pay the app.
              </Text>
              <Button
                label="Sign in with OpenRouter"
                icon="log-in-outline"
                loading={busy === 'signin'}
                disabled={!isWeb}
                onPress={signIn}
              />
              {!isWeb && <Text style={styles.muted}>Sign-in is available in the web app.</Text>}
            </Panel>

            <Panel style={styles.gap}>
              <Text style={styles.cardTitle}>Use your own API key</Text>
              <Text style={styles.muted}>
                Paste a key from Claude, OpenAI or Google. The key is stored only in this browser and goes straight to the provider.
              </Text>
              <View style={styles.chips}>
                {KEY_PROVIDERS.map((id) => (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: provider === id }}
                    style={[styles.chip, provider === id && styles.chipOn]}
                    onPress={() => { setProvider(id); setProblem(null); }}
                  >
                    <Text style={[styles.chipText, provider === id && styles.chipTextOn]}>{PROVIDERS[id].label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel={`${info.label} API key`}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={info.keyPlaceholder}
                placeholderTextColor="#a8a8a8"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Model (optional)"
                value={model}
                onChangeText={setModel}
                placeholder={`Model: ${info.defaultModel}`}
                placeholderTextColor="#a8a8a8"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(info.keyUrl)}>
                <Text style={styles.link}>Get a {info.label} key</Text>
              </Pressable>
              <Button label="Connect" icon="key-outline" loading={busy === 'key'} disabled={!apiKey.trim()} onPress={connectKey} />
            </Panel>

            <Panel style={[styles.gap, styles.soon]}>
              <View style={styles.badgeRow}>
                <Text style={styles.cardTitle}>Sign in with ChatGPT</Text>
                <View style={styles.pending}><Text style={styles.pendingText}>PENDING</Text></View>
              </View>
              <Text style={styles.muted}>
                Would let Plus and Pro subscribers use their ChatGPT plan instead of an API key. OpenAI only offers this to
                hosted apps it has approved, so it switches on once the app is approved. Until then use OpenRouter or a key.
              </Text>
              <Button label="Sign in with ChatGPT" icon="chatbubble-ellipses-outline" variant="secondary" disabled />
            </Panel>
          </>
        )}

        <Panel style={styles.gap}>
          <Text style={styles.cardTitle}>What gets shared</Text>
          <Text style={styles.muted}>
            Only when you press "Check with AI", the photo you just took is sent to the provider you connected. Nothing is sent
            while AI is off, and live scanning always stays on your device.
          </Text>
          <Text style={styles.muted}>
            Claude and Gemini do not let apps sign in with a consumer account, so those need a key or OpenRouter. AI can still
            misread cards, so you always confirm the result.
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { ...contentWidth, padding: 20, paddingBottom: 48, gap: 14 },
  flex: { flex: 1 },
  gap: { gap: 12 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  link: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  ok: { color: colors.successText, fontWeight: '800' },
  problem: { flexDirection: 'row', gap: 8, backgroundColor: '#fdecec', borderRadius: 12, padding: 12, alignItems: 'center' },
  problemText: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  connectedHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recommended: { backgroundColor: colors.successMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  recommendedText: { color: colors.successText, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  pending: { backgroundColor: colors.goldMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { color: colors.goldText, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  soon: { backgroundColor: '#fafafa' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  chipTextOn: { color: '#ffffff' },
  input: {
    height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    paddingHorizontal: 14, color: colors.text, fontSize: 15,
  },
});
