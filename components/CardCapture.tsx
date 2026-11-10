import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { CardRecognitionService } from '@/services/CardRecognitionService';
import { RecognitionResult } from '@/types/poker';
import { notify } from '@/utils/dialogs';

interface Props {
  expectedCount: number;
  label?: string;
  onResult: (result: RecognitionResult) => void;
}

type Mode = 'closed' | 'camera' | 'processing';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CardCapture({ expectedCount, label = 'Take photo', onResult }: Props) {
  const camera = useRef<CameraView>(null);
  const run = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('closed');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [warmStatus, setWarmStatus] = useState<string | null>(null);
  const processing = mode === 'processing';

  useEffect(() => {
    let active = true;
    CardRecognitionService.warmUp((next) => active && setWarmStatus(next))
      .catch(() => undefined)
      .finally(() => active && setWarmStatus(null));
    return () => {
      active = false;
    };
  }, []);

  const process = async (uri: string) => {
    const token = ++run.current;
    setPhotoUri(uri);
    setStatus('Reading photo…');
    setMode('processing');
    await pause(60);

    let result: RecognitionResult;
    try {
      result = await CardRecognitionService.recognize(uri, expectedCount, (next) => {
        if (token === run.current) setStatus(next);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      result = { cards: [], source: 'manual', message: `Detection failed (${reason}). Select the cards manually.` };
    }
    if (token !== run.current) return;

    setMode('closed');
    setPhotoUri(null);
    await pause(80);
    onResult(result);
  };

  const cancel = () => {
    run.current += 1;
    setMode('closed');
    setPhotoUri(null);
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        notify('Camera permission needed', 'Enable camera access in system settings, or choose a photo instead.');
        return;
      }
    }
    setMode('camera');
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled) await process(result.assets[0].uri);
  };

  const capture = async () => {
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
      if (photo) await process(photo.uri);
    } catch {
      notify('Could not take picture', 'Try again or choose a photo from your library.');
    }
  };

  return (
    <View style={styles.actions}>
      <Pressable style={styles.primary} onPress={openCamera} disabled={processing}>
        <Ionicons name="camera" size={19} color={colors.background} />
        <Text style={styles.primaryText}>{label}</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={choosePhoto} disabled={processing}>
        <Ionicons name="images-outline" size={19} color={colors.primary} />
        <Text style={styles.secondaryText}>Choose photo</Text>
      </Pressable>
      {warmStatus && !processing && (
        <View style={styles.warm}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.warmText}>{warmStatus}</Text>
        </View>
      )}
      <Modal visible={mode !== 'closed'} animationType="fade" onRequestClose={processing ? cancel : () => setMode('closed')}>
        <View style={styles.screen}>
          {mode === 'camera' && (
            <>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
              <View style={styles.guide} pointerEvents="none">
                <Text style={styles.guideText}>Fit {expectedCount} card{expectedCount > 1 ? 's' : ''} inside the frame</Text>
              </View>
              <Pressable accessibilityLabel="Close camera" style={styles.close} onPress={() => setMode('closed')}>
                <Ionicons name="close" size={28} color={colors.text} />
              </Pressable>
              <Pressable accessibilityLabel="Take picture" style={styles.shutter} onPress={capture}>
                <View style={styles.shutterInner} />
              </Pressable>
            </>
          )}
          {processing && photoUri && (
            <>
              <Image
                accessibilityLabel="Captured photo"
                source={{ uri: photoUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
              <View style={styles.panel}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.panelText} accessibilityLiveRegion="polite">{status}</Text>
                <Pressable accessibilityLabel="Cancel detection" onPress={cancel} hitSlop={10}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  primary: {
    backgroundColor: colors.primary, minHeight: 48, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12,
  },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 15 },
  secondary: {
    minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12,
  },
  secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  warm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  warmText: { color: colors.textMuted, fontSize: 12 },
  screen: { flex: 1, backgroundColor: '#000' },
  guide: {
    position: 'absolute', left: 24, right: 24, top: '28%', height: 200, borderWidth: 2,
    borderColor: colors.primary, borderRadius: 18, alignItems: 'center',
  },
  guideText: { color: colors.text, backgroundColor: '#08110dcc', padding: 8, borderRadius: 8, marginTop: -18, overflow: 'hidden' },
  shutter: {
    position: 'absolute', bottom: 48, alignSelf: 'center', width: 72, height: 72,
    borderRadius: 36, borderWidth: 4, borderColor: colors.text, padding: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.text, borderRadius: 30 },
  close: { position: 'absolute', top: 54, right: 20, backgroundColor: '#08110daa', padding: 8, borderRadius: 24 },
  panel: {
    position: 'absolute', left: 20, right: 20, bottom: 40, flexDirection: 'row', alignItems: 'center',
    gap: 12, backgroundColor: '#08110df0', borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  panelText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  cancel: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
});
