import { Platform } from 'react-native';

/** Light, editorial palette: white cards on a pale canvas, near-black ink and a hot red-orange accent. */
export const colors = {
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceRaised: '#f0f0f0',
  border: '#e0e0e0',
  primary: '#f83f27',
  primaryHover: '#f96552',
  primaryMuted: '#fde6e2',
  onPrimary: '#ffffff',
  text: '#171717',
  textMuted: '#6b6b6b',
  danger: '#e44145',
  success: '#07bc6e',
  successMuted: '#dcf6ea',
  successText: '#04784a',
  goldText: '#8a6200',
  gold: '#d99a00',
  goldMuted: '#fff3d1',
  redSuit: '#e44145',
  blackSuit: '#171717',
  ink: '#0f0f0f',
  inkRaised: '#2e2e2e',
};

/** Colours for anything drawn over the camera preview or a photo, which is always dark. */
export const overlay = {
  text: '#ffffff',
  textMuted: '#a8a8a8',
  scrim: '#0f0f0fcc',
  scrimStrong: '#0f0f0ff0',
  scrimSoft: '#0f0f0faa',
  border: '#4d4d4d',
  accent: '#f83f27',
  good: '#07bc6e',
  warn: '#f6c453',
  bad: '#ff5a5f',
  onColor: '#0f0f0f',
};

export const fonts = {
  body: Platform.select({
    web: "Inter, 'Helvetica Neue', Arial, system-ui, sans-serif",
    default: undefined,
  }),
};

export const radius = { card: 16, button: 16, pill: 999 };

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(23,23,23,0.06), 0 6px 18px rgba(23,23,23,0.05)' },
  default: { shadowColor: '#171717', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
}) as object;
