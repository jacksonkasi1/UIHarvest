declare module 'culori' {
  export type Color = Record<string, unknown>;
  export function parse(color: string): Color | undefined;
  export function formatHex(color: Color): string;
  export function formatHsl(color: Color): string;
  export function formatRgb(color: Color): string;
}
