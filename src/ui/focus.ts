const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (control) => control.getClientRects().length > 0,
  );
}

/** Keep keyboard focus inside a visible modal dialog. */
export function trapDialogTab(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const controls = visibleControls(root);
  if (controls.length === 0) {
    event.preventDefault();
    return;
  }

  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/** Focus the first currently visible control in a dialog. */
export function focusDialogStart(root: HTMLElement): void {
  visibleControls(root)[0]?.focus();
}
