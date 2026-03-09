// ** import types
import type { ComponentRecipe, ComputedStyle } from '../ir/types.js';

/**
 * Detect UI components from computed styles using tag-based and pattern-based heuristics.
 */
export function detectComponents(styles: ComputedStyle[]): ComponentRecipe[] {
  const components: ComponentRecipe[] = [];
  const styleMap = new Map(styles.map((s) => [s.selector.toLowerCase(), s]));

  for (const style of styles) {
    const tag = style.selector.toLowerCase();
    const p = style.properties;

    if (tag === 'button') {
      components.push(recipe('button', 'button', p, 'Interactive action element'));
    }

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      components.push(recipe('input', tag, p, 'Form input element'));
    }

    if ((tag === 'div' || tag === 'section' || tag === 'article') && isCard(p)) {
      components.push(recipe('card', `${tag}-card`, p, 'Content card container'));
    }

    if (tag === 'nav') {
      components.push(recipe('navigation', 'nav', p, 'Navigation container'));
    }
    if (tag === 'header' && isHorizontal(p)) {
      components.push(recipe('navigation', 'header-nav', p, 'Header navigation bar'));
    }

    if (tag === 'form') {
      components.push(recipe('form', 'form', p, 'Form container'));
    }

    if (tag === 'table') {
      components.push(recipe('table', 'table', p, 'Data table'));
    }
  }

  const h1 = styleMap.get('h1');
  const main = styleMap.get('main') ?? styleMap.get('section');
  if (h1 && isLargeText(h1.properties) && main) {
    components.push(
      recipe('unknown', 'hero-section', main.properties, 'Hero section with large heading and CTA')
    );
  }

  const footer = styleMap.get('footer');
  if (footer) {
    components.push(recipe('unknown', 'footer', footer.properties, 'Page footer'));
  }

  const span = styleMap.get('span');
  if (span && isBadge(span.properties)) {
    components.push(recipe('unknown', 'badge', span.properties, 'Badge or tag element'));
  }

  const label = styleMap.get('label');
  const input = styleMap.get('input');
  if (label && input) {
    components.push(
      recipe(
        'form',
        'form-group',
        { ...label.properties, ...input.properties },
        'Label + input form group'
      )
    );
  }

  return components;
}

function recipe(
  type: ComponentRecipe['type'],
  name: string,
  styles: Record<string, string>,
  usage: string
): ComponentRecipe {
  return { type, name, styles, usage, constraints: [], do: [], dont: [] };
}

function isCard(p: Record<string, string>): boolean {
  const hasShadow = p.boxShadow && p.boxShadow !== 'none';
  const hasRadius = parseFloat(p.borderRadius ?? '0') > 0;
  const hasPadding = parseFloat(p.padding ?? '0') > 0;
  const hasBorder = p.border && p.border !== 'none' && p.border !== '0px none';
  return (!!hasShadow || !!hasBorder) && hasRadius && hasPadding;
}

function isHorizontal(p: Record<string, string>): boolean {
  return p.display === 'flex' && (p.flexDirection === 'row' || !p.flexDirection);
}

function isLargeText(p: Record<string, string>): boolean {
  const size = parseFloat(p.fontSize ?? '0');
  return size >= 28;
}

function isBadge(p: Record<string, string>): boolean {
  const size = parseFloat(p.fontSize ?? '16');
  const hasRadius = parseFloat(p.borderRadius ?? '0') > 0;
  const hasBg = p.backgroundColor && p.backgroundColor !== 'rgba(0, 0, 0, 0)';
  return size <= 14 && hasRadius && !!hasBg;
}
