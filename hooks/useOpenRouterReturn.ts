import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { completeOpenRouterSignIn, pendingSignInCode } from '@/services/ai/openRouterAuth';
import { saveConnection } from '@/services/ai/storage';
import { notify } from '@/utils/dialogs';

/** Finishes an OpenRouter sign-in when the browser comes back to the app with `?code=` in the address. */
export function useOpenRouterReturn() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const code = pendingSignInCode(window.location.search);
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);
    completeOpenRouterSignIn(code)
      .then((connection) => {
        saveConnection(connection);
        router.push('/ai');
      })
      .catch((error) => notify('Sign-in failed', error instanceof Error ? error.message : 'Please try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
