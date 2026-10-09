export const Colors = {
  black: '#000000',
  white: '#FFFFFF',
  text: '#F5F5F7',
  textSubtle: 'rgba(245, 245, 247, 0.65)',
  
  // Premium Glass Surfaces
  glassPrimary: 'rgba(255, 255, 255, 0.12)',
  glassSecondary: 'rgba(255, 255, 255, 0.08)',
  glassTertiary: 'rgba(255, 255, 255, 0.04)',
  
  // Borders
  borderGlass: 'rgba(255, 255, 255, 0.18)',
  borderGlassSubtle: 'rgba(255, 255, 255, 0.08)',

  // Alerts & Modes
  modeBlind: '#AF52DE',
  modeDeaf: '#0071E3',
  modeMiddleware: '#FF9F0A',
  modeRead: '#30B0C7',
  modePhrases: '#FF6482',
  modeLoud: '#FFD60A',

  // Dark text for light accent backgrounds (orange, green, yellow) to keep WCAG AA contrast.
  onAccent: '#111114',

  success: '#34C759',
  warning: '#FF9F0A',
  error: '#FF3B30',
  
  background: '#0D0D0F', // Very dark gray/black OLED friendly
};

export const Typography = {
  sizes: {
    hero: 44,
    title1: 34,
    title2: 28,
    title3: 22,
    headline: 17,
    body: 17,
    caption: 13,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  }
};

export const Shadows = {
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
};
