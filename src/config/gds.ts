// GDS Design System colour palette — single source of truth
// All components must import from here instead of using raw hex values.
// CSS variables are defined in gds.css :root and should be used in stylesheets.
// This module provides the same values for use in TypeScript/JSX.

export const GDS_COLOURS = {
  red: '#d4351c',
  blue: '#1d70b8',
  purple: '#4c2c92',
  green: '#00703c',
  greenDark: '#005a30',
  orange: '#f47738',
  grey: '#b1b4b6',
  darkBlue: '#003078',
  white: '#ffffff',
  black: '#0b0c0c',
  lightGrey: '#f3f2f1',
  midGrey: '#505a5f',
  turquoise: '#28a197',
  yellow: '#ffdd00',
} as const;

export type GdsColourKey = keyof typeof GDS_COLOURS;
