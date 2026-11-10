import { ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, overlay } from '@/constants/theme';
import { LiveOverlay } from '@/components/LiveOverlay';
import { RecognitionConfirmation } from '@/components/RecognitionConfirmation';
import { useLiveScan } from '@/hooks/useLiveScan';
import { CardRecognitionService } from '@/services/CardRecognitionService';
import { LiveMode } from '@/services/LiveScanService';
import { liveCodes } from '@/services/recognition/live';
import { cardToCode } from '@/services/recognition/yolo';
import { Card, RecognitionResult, TableDetection } from '@/types/poker';
import { confirmAction, notify } from '@/utils/dialogs';
import { captureWarning, counterLabel, describeLive } from '@/utils/liveBanner';
import { compareRecognition } from '@/utils/liveComparison';

interface Props {
  expectedCount?: number;
  label?: string;
  /** Scan a photo of the whole table instead of a fixed number of cards. */
  table?: boolean;
  /** Cards that cannot be chosen while correcting, e.g. cards held by other players. */
  blocked?: Card[];
  /** Heading of the confirmation screen. */
  confirmTitle?: string;
  onResult?: (result: RecognitionResult) => void;
  /** `liveCodes` are the cards the live preview trusted when the photo was taken. */
  onTable?: (detection: TableDetection, photoUri: string, liveCodes: string[]) => void;
}

type Mode = 'closed' | 'camera' | 'processing' | 'confirm';
type FocusMode = 'on' | 'off';

/**
 * expo-camera only exposes an autofocus mode, not a focus point, and its two
 * values mean opposite things on the web (on = continuous, off = locked) and on
 * phones (on = focus once, off = continuous). A refocus therefore briefly flips
 * the mode and then restores the normal continuous behaviour.
 */
const IDLE_FOCUS: FocusMode = Platform.OS === 'web' ? 'on' : 'off';
const REFOCUS_FOCUS: FocusMode = Platform.OS === 'web' ? 'off' : 'on';
const REFOCUS_MS = Platform.OS === 'web' ? 350 : 1500;
const FOCUS_NOTICE_MS = 1400;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Pending {
  uri: string;
  result: RecognitionResult;
  liveCodes: string[];
}

const BANNER_COLORS = { neutral: overlay.textMuted, good: overlay.good, warn: overlay.warn, bad: overlay.bad } as const;

export function CardCapture({
  expectedCount = 1, label = 'Take photo', table = false, blocked = [], confirmTitle = 'Detected cards', onResult, onTable,
}: Props) {
  const camera = useRef<CameraView>(null);
  const cameraHost = useRef<ComponentRef<typeof View>>(null);
  const run = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('closed');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [warmStatus, setWarmStatus] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>(IDLE_FOCUS);
  const [focusing, setFocusing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [cameraBox, setCameraBox] = useState({ width: 0, height: 0 });
  const focusTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const processing = mode === 'processing';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const liveMode: LiveMode = table ? { kind: 'table' } : { kind: 'cards', expected: expectedCount };
  const live = useLiveScan({ active: mode === 'camera', rootRef: cameraHost, mode: liveMode });
  const banner = describeLive({ ...live, mode: liveMode });
  const ready = !!live.snapshot?.stable;

  useEffect(() => {
    let active = true;
    CardRecognitionService.warmUp((next) => active && setWarmStatus(next))
      .catch(() => undefined)
      .finally(() => active && setWarmStatus(null));
    return () => {
      active = false;
    };
  }, []);

  const clearFocusTimers = () => {
    focusTimers.current.forEach(clearTimeout);
    focusTimers.current = [];
  };

  useEffect(() => clearFocusTimers, []);

  useEffect(() => {
    if (mode !== 'camera') {
      clearFocusTimers();
      setFocusMode(IDLE_FOCUS);
      setFocusing(false);
    }
  }, [mode]);

  const refocus = () => {
    clearFocusTimers();
    setFocusing(true);
    setFocusMode(REFOCUS_FOCUS);
    focusTimers.current = [
      setTimeout(() => setFocusMode(IDLE_FOCUS), REFOCUS_MS),
      setTimeout(() => setFocusing(false), Math.max(FOCUS_NOTICE_MS, REFOCUS_MS)),
    ];
  };

  const process = async (uri: string, seenLive: string[] = []) => {
    const token = ++run.current;
    setPhotoUri(uri);
    setStatus('Reading photo…');
    setMode('processing');
    await pause(60);

    const report = (next: string) => {
      if (token === run.current) setStatus(next);
    };

    if (table) {
      let detection: TableDetection;
      try {
        detection = await CardRecognitionService.recognizeTable(uri, report);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        detection = { imageWidth: 0, imageHeight: 0, cards: [], message: `Detection failed (${reason}).` };
      }
      if (token !== run.current) return;
      setMode('closed');
      setPhotoUri(null);
      await pause(80);
      onTable?.(detection, uri, seenLive);
      return;
    }

    let result: RecognitionResult;
    try {
      result = await CardRecognitionService.recognize(uri, expectedCount, report);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      result = { cards: [], source: 'manual', message: `Detection failed (${reason}). Select the cards manually.` };
    }
    if (token !== run.current) return;
    setPending({ uri, result, liveCodes: seenLive });
    setMode('confirm');
  };

  const finish = async (result: RecognitionResult) => {
    setMode('closed');
    setPending(null);
    setPhotoUri(null);
    await pause(80);
    onResult?.(result);
  };

  const cancel = () => {
    run.current += 1;
    setMode('closed');
    setPhotoUri(null);
    setPending(null);
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

  const takePicture = async (seenLive: string[]) => {
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 1 });
      if (photo) await process(photo.uri, seenLive);
    } catch {
      notify('Could not take picture', 'Try again or choose a photo from your library.');
    }
  };

  const capture = () => {
    const seenLive = live.snapshot ? liveCodes(live.snapshot.cards) : [];
    const warning = captureWarning(live.snapshot, liveMode);
    if (warning) {
      confirmAction('Capture anyway?', warning, 'Capture anyway', () => void takePicture(seenLive));
      return;
    }
    void takePicture(seenLive);
  };

  return (
    <View style={styles.actions}>
      <Pressable style={styles.primary} onPress={openCamera} disabled={processing}>
        <Ionicons name="camera" size={19} color={colors.onPrimary} />
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
      <Modal
        visible={mode !== 'closed'}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={processing || mode === 'confirm' ? cancel : () => setMode('closed')}>
        <View style={styles.screen}>
          {mode === 'camera' && (
            <>
              <View
                ref={cameraHost}
                style={StyleSheet.absoluteFill}
                onLayout={(event) => setCameraBox(event.nativeEvent.layout)}
              >
                <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" autofocus={focusMode} />
              </View>
              {live.snapshot && (
                <LiveOverlay cards={live.snapshot.cards} frame={live.snapshot.frame} view={cameraBox} />
              )}
              <Pressable
                accessibilityLabel="Tap to focus"
                style={StyleSheet.absoluteFill}
                onPress={refocus}
              />
              {focusing && (
                <View style={[styles.focusRing, landscape ? styles.focusRingLandscape : styles.focusRingPortrait]} pointerEvents="none">
                  <View style={styles.focusBox} />
                  <Text style={styles.focusText}>Focusing…</Text>
                </View>
              )}
              <View
                style={[
                  styles.guide,
                  landscape ? styles.guideLandscape : table ? styles.guideTablePortrait : styles.guidePortrait,
                  ready && styles.guideReady,
                ]}
                pointerEvents="none"
              >
                <Text style={styles.guideText}>
                  {table
                    ? 'Fit the board and every hand in the frame'
                    : `Fit ${expectedCount} card${expectedCount > 1 ? 's' : ''} inside the frame`}
                </Text>
              </View>
              <View
                accessibilityLabel="Live card counter"
                style={[
                  styles.counter, landscape ? styles.counterLandscape : styles.counterPortrait,
                  { borderColor: ready ? overlay.good : BANNER_COLORS[banner?.tone ?? 'neutral'] },
                ]}
                pointerEvents="none"
              >
                {live.supported && !live.snapshot && !live.error ? (
                  <ActivityIndicator size="small" color={overlay.textMuted} />
                ) : (
                  <Ionicons
                    name={ready ? 'checkmark-circle' : 'scan-outline'}
                    size={16}
                    color={ready ? overlay.good : overlay.text}
                  />
                )}
                <Text style={[styles.counterText, ready && { color: overlay.good }]}>
                  {live.supported ? counterLabel(live.snapshot, liveMode) : 'Live detection off'}
                </Text>
              </View>
              {banner && (
                <View
                  style={[styles.banner, landscape ? styles.bannerLandscape : styles.bannerPortrait, { borderColor: BANNER_COLORS[banner.tone] }]}
                  pointerEvents="none"
                >
                  <Text accessibilityLiveRegion="polite" style={[styles.bannerText, { color: BANNER_COLORS[banner.tone] }]}>
                    {banner.text}
                  </Text>
                </View>
              )}
              <Pressable
                accessibilityLabel="Close camera"
                style={[styles.close, landscape ? styles.closeLandscape : styles.closePortrait]}
                onPress={() => setMode('closed')}
              >
                <Ionicons name="close" size={28} color={overlay.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Focus camera"
                style={[styles.focus, landscape ? styles.focusLandscape : styles.focusPortrait]}
                onPress={refocus}
              >
                <Ionicons name="locate" size={26} color={focusing ? overlay.good : overlay.text} />
                <Text style={styles.focusLabel}>Focus</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Take picture"
                style={[styles.shutter, landscape ? styles.shutterLandscape : styles.shutterPortrait, ready && styles.shutterReady]}
                onPress={capture}
              >
                <View style={styles.shutterInner} />
              </Pressable>
            </>
          )}
          {mode === 'confirm' && pending && (
            <RecognitionConfirmation
              key={pending.uri}
              photoUri={pending.uri}
              result={pending.result}
              expectedCount={expectedCount}
              comparison={
                pending.liveCodes.length
                  ? compareRecognition(pending.liveCodes, pending.result.cards.map(cardToCode))
                  : null
              }
              blocked={blocked}
              title={confirmTitle}
              onConfirm={finish}
              onRetake={() => {
                setPending(null);
                void openCamera();
              }}
            />
          )}
          {processing && photoUri && (
            <>
              <Image
                accessibilityLabel="Captured photo"
                source={{ uri: photoUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
              <View style={[styles.panel, landscape ? styles.panelLandscape : styles.panelPortrait]}>
                <ActivityIndicator size="small" color={overlay.good} />
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
    backgroundColor: colors.primary, minHeight: 52, borderRadius: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12,
  },
  primaryText: { color: colors.onPrimary, fontWeight: '800', fontSize: 15 },
  secondary: {
    minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  warm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  warmText: { color: colors.textMuted, fontSize: 12 },
  screen: { flex: 1, backgroundColor: '#000' },
  guide: { position: 'absolute', borderWidth: 2, borderColor: overlay.text, borderRadius: 18, alignItems: 'center' },
  guidePortrait: { left: 24, right: 24, top: '28%', height: 200 },
  guideTablePortrait: { left: 12, right: 12, top: 100, bottom: 150 },
  guideLandscape: { left: 24, right: 130, top: 56, bottom: 48 },
  guideReady: { borderColor: overlay.good, borderWidth: 4 },
  guideText: { color: overlay.text, backgroundColor: overlay.scrim, padding: 8, borderRadius: 8, marginTop: -18, overflow: 'hidden' },
  shutter: {
    position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 4,
    borderColor: overlay.text, padding: 5, alignItems: 'center', justifyContent: 'center',
  },
  shutterPortrait: { bottom: 48, alignSelf: 'center' },
  shutterLandscape: { right: 28, top: '50%', marginTop: -36 },
  focus: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: overlay.scrimSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  focusPortrait: { bottom: 54, left: 36 },
  focusLandscape: { right: 36, top: '50%', marginTop: 64 },
  focusLabel: { color: overlay.text, fontSize: 10, fontWeight: '800', marginTop: 1 },
  focusRing: { position: 'absolute', alignItems: 'center', gap: 8 },
  focusRingPortrait: { left: 0, right: 0, top: '38%' },
  focusRingLandscape: { left: 0, right: 100, top: '40%' },
  focusBox: { width: 76, height: 76, borderRadius: 14, borderWidth: 2, borderColor: overlay.accent },
  focusText: { color: overlay.accent, fontWeight: '800', fontSize: 13, backgroundColor: overlay.scrim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  shutterReady: { borderColor: overlay.good },
  counter: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: overlay.scrim,
    borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
  },
  counterPortrait: { top: 58, left: 20 },
  counterLandscape: { top: 22, left: 24 },
  counterText: { color: overlay.text, fontWeight: '900', fontSize: 14 },
  banner: {
    position: 'absolute', backgroundColor: overlay.scrimStrong, borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bannerPortrait: { left: 20, right: 20, bottom: 138 },
  bannerLandscape: { left: 24, right: 130, bottom: 14 },
  bannerText: { fontWeight: '800', fontSize: 14, textAlign: 'center' },
  shutterInner: { flex: 1, alignSelf: 'stretch', backgroundColor: overlay.text, borderRadius: 30 },
  close: { position: 'absolute', backgroundColor: overlay.scrimSoft, padding: 8, borderRadius: 24 },
  closePortrait: { top: 54, right: 20 },
  closeLandscape: { top: 20, right: 28 },
  panel: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center',
    gap: 12, backgroundColor: overlay.scrimStrong, borderRadius: 16, borderWidth: 1, borderColor: overlay.border,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  panelPortrait: { bottom: 40 },
  panelLandscape: { bottom: 20 },
  panelText: { flex: 1, color: overlay.text, fontSize: 15, fontWeight: '700' },
  cancel: { color: overlay.textMuted, fontSize: 14, fontWeight: '700' },
});
