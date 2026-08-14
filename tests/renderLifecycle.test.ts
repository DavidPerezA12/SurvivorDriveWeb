import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CarPreview } from '../src/render/carPreview';
import { createStage, disposeSceneGeometry, type Stage } from '../src/render/scene';
import { GameView } from '../src/render/view';

const rendererState = vi.hoisted(() => ({
  instances: [] as Array<{
    domElement: { style: { cssText: string }; remove: ReturnType<typeof vi.fn> };
    dispose: ReturnType<typeof vi.fn>;
    forceContextLoss: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setClearColor: ReturnType<typeof vi.fn>;
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    info: { render: { calls: number; triangles: number } };
  }>,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class FakeWebGLRenderer {
    readonly domElement = { style: { cssText: '' }, remove: vi.fn() };
    readonly dispose = vi.fn();
    readonly forceContextLoss = vi.fn();
    readonly render = vi.fn();
    readonly setClearColor = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();
    readonly info = { render: { calls: 0, triangles: 0 } };

    constructor() {
      rendererState.instances.push(this);
    }
  }

  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

describe('render lifecycle', () => {
  let fakeWindow: EventTarget & {
    devicePixelRatio: number;
    innerHeight: number;
    innerWidth: number;
  };
  let appendChild: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rendererState.instances.length = 0;
    fakeWindow = Object.assign(new EventTarget(), {
      devicePixelRatio: 2,
      innerHeight: 720,
      innerWidth: 1280,
    });
    appendChild = vi.fn();
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', { body: { appendChild } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the stage resize listener and releases its canvas and renderer once', () => {
    const stage = createStage();
    const renderer = rendererState.instances[0]!;
    const initialResizeCalls = renderer.setSize.mock.calls.length;

    fakeWindow.dispatchEvent(new Event('resize'));
    expect(renderer.setSize).toHaveBeenCalledTimes(initialResizeCalls + 1);

    stage.destroy();
    stage.destroy();
    fakeWindow.dispatchEvent(new Event('resize'));
    stage.setPixelCap(1);

    expect(renderer.setSize).toHaveBeenCalledTimes(initialResizeCalls + 1);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(renderer.domElement.remove).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledOnce();
  });

  it('disposes shared scene geometry only once before clearing the graph', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    scene.add(new THREE.Mesh(geometry), new THREE.Mesh(geometry), new THREE.Points(geometry));

    disposeSceneGeometry(scene);

    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it('makes GameView.destroy idempotent without constructing a WebGL scene', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    scene.add(new THREE.Mesh(geometry));
    const stage = { scene, destroy: vi.fn() } as unknown as Stage;
    const view = Object.assign(Object.create(GameView.prototype), {
      destroyed: false,
      stage,
    }) as GameView;

    view.destroy();
    view.destroy();

    expect(dispose).toHaveBeenCalledOnce();
    expect(stage.destroy).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it('stops CarPreview animation and releases its owned resources once', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    scene.add(new THREE.Mesh(geometry));
    const renderer = {
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };
    const element = { remove: vi.fn() };
    const cancelAnimationFrame = vi.fn();
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const preview = Object.assign(Object.create(CarPreview.prototype), {
      destroyed: false,
      element,
      raf: 17,
      renderer,
      running: true,
      scene,
    }) as CarPreview;

    preview.destroy();
    preview.destroy();
    preview.start();

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(element.remove).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });
});
