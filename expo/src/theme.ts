// Science By Hugs Design System, core. theme (Sage). Same values as src/brand.css
// in the web app; change them in the design system first, then here.
export const colors = {
  background: '#0F1412',
  surface: '#161C19',
  surfaceRaised: '#1D2420',
  line: '#26302B',
  controlBorder: '#5F6B65',
  text: '#ECEFEC',
  textMuted: '#9DA8A2',
  accent: '#8FB89E',
  onAccent: '#0F1412',
  success: '#ECEFEC',
  warning: '#E3B866',
  error: '#E58A80',
} as const;

export const radius = { control: 10, card: 14, sheet: 20, hero: 28, pill: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 } as const;
export const touchTarget = 44;

export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
} as const;
