import type { RenderStats } from '../render';

const HISTORY = 120;

/**
 * The always-on dev overlay (docs/ARCHITECTURE.md → Budgets). It reports draw
 * calls, triangles, FPS, and frame-time stability, not just an average. The
 * p95/median figure turns red when it crosses 1.5×, the stability ceiling.
 */
export class DebugOverlay {
  private readonly root: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly frames: number[] = [];
  private accum = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'sdw-debug-overlay';
    this.root.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'padding:8px 10px',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#d8d2c4',
      'background:rgba(12,10,8,0.72)',
      'border:1px solid rgba(184,84,47,0.5)',
      'border-radius:6px',
      'pointer-events:none',
      'z-index:10',
      'white-space:pre',
    ].join(';');

    this.readout = document.createElement('div');
    this.canvas = document.createElement('canvas');
    this.canvas.width = HISTORY;
    this.canvas.height = 34;
    this.canvas.style.cssText = 'display:block;margin-top:6px;width:' + HISTORY + 'px;height:34px';

    this.root.appendChild(this.readout);
    this.root.appendChild(this.canvas);
    document.body.appendChild(this.root);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for debug overlay');
    this.ctx = ctx;
  }

  private visible = true;

  /** Show or hide the overlay (the graphics setting). Hidden = no DOM churn. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
  }

  /** Feed one rendered frame. `frameMs` is the real wall-clock frame time. */
  update(frameMs: number, stats: RenderStats): void {
    if (!this.visible) return; // hidden: skip the graph redraw and DOM writes
    this.frames.push(frameMs);
    if (this.frames.length > HISTORY) this.frames.shift();

    // Throttle the DOM text to ~5 Hz; the graph still redraws every frame.
    this.accum += frameMs;
    this.drawGraph();
    if (this.accum < 200) return;
    this.accum = 0;

    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const ratio = median > 0 ? p95 / median : 1;
    const fps = frameMs > 0 ? 1000 / frameMs : 0;
    const ratioColor = ratio > 1.5 ? '#e8503a' : '#8fbf6a';

    this.readout.innerHTML =
      `${fps.toFixed(0).padStart(3)} fps   ${frameMs.toFixed(1).padStart(5)} ms\n` +
      `draws ${String(stats.drawCalls).padStart(4)}   tris ${formatK(stats.triangles)}\n` +
      `p95/med <span style="color:${ratioColor}">${ratio.toFixed(2)}×</span>  (budget ≤ 1.50×)`;
  }

  private drawGraph(): void {
    const { ctx, canvas } = this;
    const h = canvas.height;
    ctx.clearRect(0, 0, canvas.width, h);

    // 16.7 ms (60 fps) reference line.
    const scale = h / 50; // full height ≈ 50 ms
    const ref = h - 16.7 * scale;
    ctx.strokeStyle = 'rgba(143,191,106,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, ref);
    ctx.lineTo(canvas.width, ref);
    ctx.stroke();

    ctx.strokeStyle = '#c7b26a';
    ctx.beginPath();
    for (let i = 0; i < this.frames.length; i += 1) {
      const y = Math.max(0, h - this.frames[i] * scale);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }
}

function formatK(n: number): string {
  return (n / 1000).toFixed(0).padStart(4) + 'k';
}
