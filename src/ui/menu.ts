import type { MotionPref, Quality, Settings } from '../app/settings';

/**
 * The pause menu and settings panel (the `ui/` layer): a DOM overlay, built
 * once and toggled by `display`, never rebuilt. It captures pointer input
 * (unlike the HUD) and emits player intent back to the app through callbacks —
 * resume, restart, and a settings delta. It holds no per-frame work, so an open
 * menu costs nothing the loop has to pay; the app stops the loop entirely while
 * it is up (docs/ARCHITECTURE.md → Game loop).
 *
 * Edits apply live (the app re-applies settings on each change) so a player
 * sees graphics quality or shake change as they drag — the blindfold test for
 * settings, not just upgrades.
 */
export interface MenuCallbacks {
  onResume(): void;
  onRestart(): void;
  onGarage(): void;
  onSettingsChange(settings: Settings): void;
}

/** A built control: its DOM node plus a refresher that re-reads selected state. */
interface Control {
  el: HTMLElement;
  sync(): void;
}

const EMBER = 'rgba(184,84,47,0.5)';
const PANEL_BG = 'rgba(12,10,8,0.92)';

export class Menu {
  private readonly root: HTMLDivElement;
  private readonly pausePane: HTMLDivElement;
  private readonly settingsPane: HTMLDivElement;
  private readonly cb: MenuCallbacks;
  private readonly controls: Control[] = [];
  private settings: Settings;
  private open = false;
  private settingsView = false;

  constructor(initial: Settings, cb: MenuCallbacks) {
    this.cb = cb;
    this.settings = { ...initial };

    this.root = document.createElement('div');
    this.root.className = 'sdw-menu';
    this.root.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(8,6,4,0.55)',
      'backdrop-filter:blur(2px)',
      'font:600 14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#e8d9c4',
      'z-index:30',
    ].join(';');

    this.pausePane = this.buildPausePane();
    this.settingsPane = this.buildSettingsPane();
    this.root.append(this.pausePane, this.settingsPane);
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.open;
  }

  inSettings(): boolean {
    return this.open && this.settingsView;
  }

  /** Show the menu at its top level (the pause list). */
  show(): void {
    this.open = true;
    this.showRoot();
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.open = false;
    this.root.style.display = 'none';
  }

  showRoot(): void {
    this.settingsView = false;
    this.pausePane.style.display = 'flex';
    this.settingsPane.style.display = 'none';
  }

  showSettings(): void {
    this.settingsView = true;
    this.pausePane.style.display = 'none';
    this.settingsPane.style.display = 'flex';
    for (const c of this.controls) c.sync();
  }

  private buildPausePane(): HTMLDivElement {
    const pane = panel();
    pane.appendChild(heading('PAUSED', 34, 7, '#e8503a'));
    pane.appendChild(button('Resume', () => this.cb.onResume()));
    pane.appendChild(button('Garage', () => this.cb.onGarage()));
    pane.appendChild(button('Restart run', () => this.cb.onRestart()));
    pane.appendChild(button('Settings', () => this.showSettings()));
    const hint = document.createElement('div');
    hint.className = 'sdw-menu__hint';
    hint.textContent = 'Esc to resume';
    hint.style.cssText = 'margin-top:8px;opacity:0.55;font-size:12px';
    pane.appendChild(hint);
    return pane;
  }

  private buildSettingsPane(): HTMLDivElement {
    const pane = panel();
    pane.style.display = 'none';
    pane.appendChild(heading('SETTINGS', 24, 5, '#e0a93a'));

    this.add(
      pane,
      segmented<Quality>(
        'Graphics',
        [
          ['Low', 'low'],
          ['Medium', 'medium'],
          ['High', 'high'],
        ],
        () => this.settings.quality,
        (v) => this.patch({ quality: v }),
      ),
    );

    this.add(
      pane,
      segmented<MotionPref>(
        'Reduced motion',
        [
          ['Auto', 'auto'],
          ['On', 'on'],
          ['Off', 'off'],
        ],
        () => this.settings.motion,
        (v) => this.patch({ motion: v }),
      ),
    );

    this.add(
      pane,
      slider('Screen shake', () => this.settings.shake, (v) => this.patch({ shake: v })),
    );

    this.add(
      pane,
      slider(
        'Volume',
        () => this.settings.volume,
        (v) => this.patch({ volume: v }),
        'audio coming soon',
      ),
    );

    this.add(
      pane,
      segmented<boolean>(
        'Debug overlay',
        [
          ['On', true],
          ['Off', false],
        ],
        () => this.settings.debugOverlay,
        (v) => this.patch({ debugOverlay: v }),
      ),
    );

    pane.appendChild(button('Back', () => this.showRoot()));
    return pane;
  }

  private add(pane: HTMLDivElement, control: Control): void {
    this.controls.push(control);
    pane.appendChild(control.el);
  }

  /** Merge a settings delta, emit it, and refresh the controls' selected state. */
  private patch(delta: Partial<Settings>): void {
    this.settings = { ...this.settings, ...delta };
    this.cb.onSettingsChange(this.settings);
    for (const c of this.controls) c.sync();
  }
}

function panel(): HTMLDivElement {
  const p = document.createElement('div');
  p.className = 'sdw-menu__pane';
  p.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:stretch',
    'gap:9px',
    'min-width:268px',
    'padding:22px 26px',
    `background:${PANEL_BG}`,
    `border:1px solid ${EMBER}`,
    'border-radius:10px',
    'text-align:center',
  ].join(';');
  return p;
}

function heading(text: string, size: number, spacing: number, color: string): HTMLDivElement {
  const h = document.createElement('div');
  h.textContent = text;
  h.style.cssText = `font-size:${size}px;letter-spacing:${spacing}px;color:${color};margin-bottom:6px`;
  return h;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = [
    'appearance:none',
    'cursor:pointer',
    'padding:9px 14px',
    'font:inherit',
    'color:#e8d9c4',
    'background:rgba(40,30,24,0.9)',
    `border:1px solid ${EMBER}`,
    'border-radius:6px',
  ].join(';');
  b.addEventListener('click', onClick);
  b.addEventListener('mouseenter', () => (b.style.background = 'rgba(64,46,36,0.95)'));
  b.addEventListener('mouseleave', () => (b.style.background = 'rgba(40,30,24,0.9)'));
  return b;
}

/** A labelled row: caption on the left, control on the right. */
function row(label: string, control: HTMLElement, note?: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'sdw-menu__row';
  wrap.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left';
  const caption = document.createElement('div');
  const tag = document.createElement('div');
  tag.textContent = label;
  tag.style.cssText = 'color:#cdbb95;font-size:12px';
  caption.appendChild(tag);
  if (note) {
    const small = document.createElement('div');
    small.textContent = note;
    small.style.cssText = 'color:#7a7064;font-size:10px;letter-spacing:0.5px';
    caption.appendChild(small);
  }
  wrap.append(caption, control);
  return wrap;
}

/** A segmented pick-one control. `get`/`set` bridge to the live settings. */
function segmented<T>(
  label: string,
  options: [string, T][],
  get: () => T,
  set: (value: T) => void,
): Control {
  const group = document.createElement('div');
  group.style.cssText = 'display:flex;gap:0;flex:0 0 auto';
  const buttons: { btn: HTMLButtonElement; value: T }[] = [];

  options.forEach(([text, value], i) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
      'appearance:none',
      'cursor:pointer',
      'padding:5px 10px',
      'font:600 11px/1 ui-monospace,Menlo,monospace',
      'color:#cdbb95',
      'background:rgba(28,22,18,0.9)',
      `border:1px solid ${EMBER}`,
      i === 0 ? 'border-radius:5px 0 0 5px' : '',
      i === options.length - 1 ? 'border-radius:0 5px 5px 0' : '',
      i > 0 ? 'border-left:none' : '',
    ]
      .filter(Boolean)
      .join(';');
    btn.addEventListener('click', () => set(value));
    group.appendChild(btn);
    buttons.push({ btn, value });
  });

  const sync = (): void => {
    const active = get();
    for (const { btn, value } of buttons) {
      const on = value === active;
      btn.style.background = on ? 'rgba(184,84,47,0.85)' : 'rgba(28,22,18,0.9)';
      btn.style.color = on ? '#1a120c' : '#cdbb95';
    }
  };
  sync();

  return { el: row(label, group), sync };
}

/** A 0..1 slider. Optional `note` marks an inert control (e.g. audio). */
function slider(
  label: string,
  get: () => number,
  set: (value: number) => void,
  note?: string,
): Control {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.style.cssText = 'width:120px;accent-color:#b8542f;cursor:pointer;flex:0 0 auto';
  if (note) {
    input.disabled = true;
    input.style.opacity = '0.4';
    input.style.cursor = 'not-allowed';
  } else {
    input.addEventListener('input', () => set(Number(input.value) / 100));
  }

  const sync = (): void => {
    input.value = String(Math.round(get() * 100));
  };
  sync();

  return { el: row(label, input, note), sync };
}
