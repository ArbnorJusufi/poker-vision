import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { CardRecognitionService } from '@/services/CardRecognitionService';

interface Props {
  expectedCount: number;
  onManualEntry: (message?: string) => void;
}

export function CardCapture({ expectedCount, onManualEntry }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const process = async (uri: string) => {
    setBusy(true);
    try {
      const result = await CardRecognitionService.recognize(uri, expectedCount);
      if (result.cards.length !== expectedCount) onManualEntry(result.message);
      else onManualEntry('Recognition adapter returned cards; review them before continuing.');
    } catch {
      onManualEntry('Recognition failed. Select the cards manually.');
    } finally {
      setBusy(false);
      setActive(false);
    }
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        Alert.alert('Camera permission needed', 'Enable camera access in system settings, or choose a photo.');
        return;
      }
    }
    setActive(true);
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled) await process(result.assets[0].uri);
  };

  if (active) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={styles.camera} facing="back" />
        <View style={styles.guide}><Text style={styles.guideText}>Fit {expectedCount} cards inside the frame</Text></View>
        <Pressable
          accessibilityLabel="Take picture"
          style={styles.shutter}
          disabled={busy}
          onPress={async () => {
            const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
            if (photo) await process(photo.uri);
          }}
        ><View style={styles.shutterInner} /></Pressable>
        <Pressable style={styles.close} onPress={() => setActive(false)}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <Pressable style={styles.primary} onPress={openCamera}>
        <Ionicons name="camera" size={20} color={colors.background} />
        <Text style={styles.primaryText}>Open camera</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={choosePhoto}>
        <Ionicons name="images-outline" size={20} color={colors.primary} />
        <Text style={styles.secondaryText}>Choose photo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12 },
  primary: {
    backgroundColor: colors.primary, minHeight: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryText: { color: colors.background, fontWeight: '800', fontSize: 16 },
  secondary: {
    minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  cameraWrap: { height: 440, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  camera: { flex: 1 },
  guide: {
    position: 'absolute', left: 28, right: 28, top: 100, height: 180, borderWidth: 2,
    borderColor: colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'flex-start',
  },
  guideText: { color: colors.text, backgroundColor: '#08110dcc', padding: 8, borderRadius: 8, marginTop: -38 },
  shutter: {
    position: 'absolute', bottom: 20, alignSelf: 'center', width: 68, height: 68,
    borderRadius: 34, borderWidth: 4, borderColor: colors.text, padding: 5,
  },
  shutterInner: { flex: 1, backgroundColor: colors.text, borderRadius: 30 },
  close: { position: 'absolute', top: 16, right: 16, backgroundColor: '#08110daa', padding: 8, borderRadius: 24 },
});
