// ** import types
import type { MotionToken, ComputedStyle } from '../ir/types.js';

/**
 * Extract motion tokens (transition, animation, transform) from computed styles.
 * Skips default/none values.
 */
export function extractMotion(styles: ComputedStyle[]): MotionToken[] {
  const tokens: MotionToken[] = [];

  for (const style of styles) {
    const { transition, animation, transform } = style.properties;

    if (transition && !isNone(transition)) {
      tokens.push({ selector: style.selector, property: 'transition', value: transition });
    }
    if (animation && !isNone(animation)) {
      tokens.push({ selector: style.selector, property: 'animation', value: animation });
    }
    if (transform && !isNone(transform)) {
      tokens.push({ selector: style.selector, property: 'transform', value: transform });
    }
  }

  return tokens;
}

function isNone(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'none' || v === 'all 0s ease 0s' || v === '' || v === '0s';
}
