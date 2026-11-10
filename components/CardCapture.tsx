import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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

export function CardCapture({ expectedCount, label = 'Take photo', onResult }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const process = async (uri: string) => {
    setBusy(true);
    try {
      onResult(await CardRecognitionService.recognize(uri, expectedCount));
    } catch {
      onResult({ cards: [], source: 'manual', message: 'Recognition failed. Select the cards manually.' });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        notify('Camera permission needed', 'Enable camera access in system settings, or choose a photo instead.');
        return;
      }
    }
    setOpen(true);
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
      <Pressable style={styles.primary} onPress={openCamera} disabled={busy}>
        <Ionicons name="camera" size={19} color={colors.background} />
        <Text style={styles.primaryText}>{label}</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={choosePhoto} disabled={busy}>
        <Ionicons name="images-outline" size={19} color={colors.primary} />
        <Text style={styles.secondaryText}>Choose photo</Text>
      </Pressable>
      {busy && !open && <ActivityIndicator color={colors.primary} />}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.cameraScreen}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.guide} pointerEvents="none">
            <Text style={styles.guideText}>Fit {expectedCount} card{expectedCount > 1 ? 's' : ''} inside the frame</Text>
          </View>
          <Pressable accessibilityLabel="Close camera" style={styles.close} onPress={() => setOpen(false)}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          {busy ? (
            <ActivityIndicator style={styles.shutter} size="large" color={colors.text} />
          ) : (
            <Pressable accessibilityLabel="Take picture" style={styles.shutter} onPress={capture}>
              <View style={styles.shutterInner} />
            </Pressable>
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
  cameraScreen: { flex: 1, backgroundColor: '#000' },
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
});
