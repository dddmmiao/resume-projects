/**
 * Inject a <style> tag into <head> exactly once and keep it updated
 * - getCssText: a function returning complete CSS text
 * - attr: a unique attribute used to find the style element for this feature
 */
export function injectStyleOnce(getCssText: () => string, attr: string = 'data-style-id'): void {
  if (typeof document === 'undefined') return;
  const head = document.head || document.getElementsByTagName('head')[0];
  let styleEl = head.querySelector(`style[${attr}]`) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.setAttribute(attr, 'true');
    head.appendChild(styleEl);
  }
  // Always refresh the CSS in case variables changed
  styleEl.textContent = getCssText();
}

