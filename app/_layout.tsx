import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameProvider } from '@/hooks/GameContext';
import { colors } from '@/constants/theme';

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap';

function useWebTheme() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_LINK;
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent =
      `html,body{background:${colors.background};}` +
      "body,div,span,input,textarea{font-family:Inter,'Helvetica Neue',Arial,system-ui,sans-serif;}" +
      "[style*='Ionicons']{font-family:Ionicons !important;}";
    document.head.appendChild(style);
    return () => {
      link.remove();
      style.remove();
    };
  }, []);
}

export default function RootLayout() {
  useWebTheme();
  return (
    <SafeAreaProvider>
      <GameProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} />
      </GameProvider>
    </SafeAreaProvider>
  );
}
