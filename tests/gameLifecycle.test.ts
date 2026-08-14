import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/app/game';

describe('game lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tears down every owned surface and global listener exactly once', () => {
    const cancelAnimationFrame = vi.fn();
    const removeWindowListener = vi.fn();
    const removeDocumentListener = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.stubGlobal('window', { removeEventListener: removeWindowListener });
    vi.stubGlobal('document', { removeEventListener: removeDocumentListener });

    const owned = (): { destroy: ReturnType<typeof vi.fn> } => ({ destroy: vi.fn() });
    const input = { ...owned(), setTouchVisible: vi.fn() };
    const motionQuery = { removeEventListener: vi.fn() };
    const save = { flush: vi.fn() };
    const surfaces = {
      carPreview: owned(),
      view: owned(),
      input,
      hud: owned(),
      overlay: owned(),
      menu: owned(),
      garage: owned(),
    };
    const game = Object.assign(Object.create(Game.prototype), {
      destroyed: false,
      running: true,
      raf: 17,
      motionQuery,
      save,
      ...surfaces,
    }) as Game;

    game.destroy();
    game.destroy();
    game.start();

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(removeDocumentListener).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledTimes(3);
    expect(motionQuery.removeEventListener).toHaveBeenCalledOnce();
    expect(save.flush).toHaveBeenCalledOnce();
    for (const surface of Object.values(surfaces)) {
      expect(surface.destroy).toHaveBeenCalledOnce();
    }
    expect(input.setTouchVisible).not.toHaveBeenCalled();
  });
});
