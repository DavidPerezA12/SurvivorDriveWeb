import * as THREE from 'three';
import { box, merged, paint, propMaterial, rockChunk } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import { ACT_SPAN, TRANSITION } from './mood';
import { BIOME_BAND_M, BIOME_TRANSITION_M, biomeForBand, type BiomeId } from '../content/biomes';
import type { Elevation } from './elevation';

/** Shared iteration order; keeping it at module scope avoids a tiny array per frame. */
const SIDES = [-1, 1] as const;

/**
 * Flat detail scattered on the dirt either side of the road, with its own look in
 * every act — the floor tells the same story the horizon does (docs/DESIGN.md →
 * Run structure: the world ends in stages). Outbreak is a paved city floor
 * (sidewalk slabs, manhole covers, broken masonry); Rust is baked suburbia dirt
 * (sand drifts, dry cracks, scorch); Swarm is the trampled ash of the overrun
 * outskirts; Visitors grows alien crystal shards up through the ground; Colossus
 * is pocked with the stomped craters of the giants; Static is fracturing into
 * grey reality shards. The scatter a band draws is chosen by the act its forward
 * sits in, and across a boundary it rebuilds slot by slot like the skyline, so the
 * ground never reads as one uniform desert under six different skies.
 *
 * The ground plane is static (the road scrolls over it), so on its own the floor
 * reads as a dead sheet; these decals stream past with distance and give it real
 * motion and texture (docs/DESIGN.md → Art direction).
 *
 * Pure decals lying on the ground, only ever off the road, so they never touch
 * gameplay — render-only, reading `distance`. They recycle by slot exactly like
 * the road wear (z = `distance − worldZ`), each slot a pure function of its index
 * and the seed, so nothing flickers and the per-frame path allocates nothing. One
 * `InstancedMesh` per kind on the lit, fogged road material, so the act lights
 * re-mood them and the far ones dissolve into the haze (docs/ARCHITECTURE.md →
 * Instancing, allocation discipline).
 */

type ScatterKind =
  | 'drift'
  | 'crack'
  | 'scorch'
  | 'slab'
  | 'manhole'
  | 'chunks'
  | 'ash'
  | 'shards'
  | 'crater'
  | 'glitch'
  | 'snowpatch'
  | 'icesheet'
  | 'dunepatch'
  | 'cable'
  | 'foam'
  | 'lavapool'
  | 'basaltchunk'
  | 'litter'
  | 'sign'
  | 'glass'
  | 'luggage'
  | 'bones'
  | 'planks'
  | 'ruts'
  | 'beamscar'
  | 'dragmark'
  | 'voidmelt';
const KINDS: readonly ScatterKind[] = [
  'drift',
  'crack',
  'scorch',
  'slab',
  'manhole',
  'chunks',
  'ash',
  'shards',
  'crater',
  'glitch',
  'snowpatch',
  'icesheet',
  'dunepatch',
  'cable',
  'foam',
  'lavapool',
  'basaltchunk',
  'litter',
  'sign',
  'glass',
  'luggage',
  'bones',
  'planks',
  'ruts',
  'beamscar',
  'dragmark',
  'voidmelt',
];

/**
 * Which scatter kinds each act's floor may draw (one is picked per slot). Listing a
 * kind more than once weights it up, so each act leans on its signature decals
 * while keeping a little shared grit. Index 0..5 walks the six acts.
 */
const ACT_SCATTER: readonly (readonly ScatterKind[])[] = [
  // I Outbreak — paved city floor, the evacuation's leavings strewn across it.
  ['slab', 'slab', 'manhole', 'litter', 'sign', 'glass', 'luggage', 'chunks'],
  // II Rust — baked suburbia dirt: drifts, cracks, bleached bones, fence planks,
  // and the ruts of the convoys that already left.
  ['drift', 'drift', 'crack', 'scorch', 'bones', 'planks', 'ruts', 'chunks'],
  ['ash', 'ash', 'crack', 'scorch', 'drift', 'chunks'], // III Swarm — trampled ash of the overrun outskirts
  // IV Visitors — alien crystal up through the ground, beam scars where they took someone.
  ['shards', 'shards', 'beamscar', 'crack', 'scorch', 'drift'],
  // V Colossus — stomped craters, drag gouges, and crushed rubble: the giants use the ground.
  ['crater', 'crater', 'dragmark', 'chunks', 'crack', 'scorch'],
  // VI Static — reality fracturing into grey shards, patches de-rendering to void.
  ['glitch', 'glitch', 'voidmelt', 'crack', 'chunks', 'drift'],
];

/**
 * The biome override: inside a geographic band the floor belongs to the place, not
 * the act — snow settles, dunes bank, the sea streams under the broken deck, the
 * lava plain glows. The open highway (and any biome without an entry) keeps the
 * act floor above. Same slot-by-slot boundary crossfade as the acts.
 */
const BIOME_SCATTER: Partial<Record<BiomeId, readonly ScatterKind[]>> = {
  // Each biome's floor mixes its signature with fitting shared decals (bones bake
  // in the sun, litter blows through the tunnel, deck planks and glass on the
  // bridge), so no stretch reads as one repeated stamp.
  snow: ['snowpatch', 'snowpatch', 'icesheet', 'icesheet', 'crack', 'chunks'],
  desert: ['dunepatch', 'dunepatch', 'bones', 'ruts', 'crack', 'scorch', 'drift'],
  tunnel: ['chunks', 'cable', 'crack', 'cable', 'litter', 'glass', 'chunks'],
  bridge: ['foam', 'foam', 'foam', 'planks', 'glass', 'foam'],
  lava: ['lavapool', 'lavapool', 'basaltchunk', 'scorch', 'crack', 'basaltchunk'],
};

const SPACING = 9;
const REACH = LOOKAHEAD * 0.62;
/** Off-road band: from just past the shoulder out into the dirt. */
const INNER = roadHalfWidth() + 2;
const OUTER = roadHalfWidth() + 50;
/** A hair above the ground plane (which sits at y = -0.08), below the road. */
const Y = -0.05;
const CAP = 40;
/** Fraction of an act band folded into a crossfade at its end, mirroring the
 *  skyline transition so the floor rebuilds into the next act gradually. */
const TRANSITION_F = TRANSITION / ACT_SPAN;

function disc(r: number, hex: number, y: number): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(r, r, 0.04, 9), hex, 0).translate(0, y, 0);
}

/** A soft, lighter sand drift — two overlapping low blobs. */
function driftGeometry(): THREE.BufferGeometry {
  const a = disc(2.2, palette.groundSand, Y);
  const b = disc(1.4, palette.groundSand, Y + 0.005).translate(1.7, 0, 0.8);
  return merged([a, b]);
}

/** A branching network of dry cracks in the earth. */
function crackGeometry(): THREE.BufferGeometry {
  const c = palette.groundScorch;
  return merged([
    box(0.14, 0.04, 3.0, c, 0).translate(0, Y, 0),
    box(0.12, 0.04, 2.0, c, 0).rotateY(0.7).translate(0.3, Y, 0.6),
    box(0.1, 0.04, 1.6, c, 0).rotateY(-0.8).translate(-0.4, Y, -0.5),
    box(0.1, 0.04, 1.2, c, 0).rotateY(1.3).translate(0.2, Y, -1.0),
  ]);
}

/** A burn scar with a couple of charred chunks sitting in it. */
function scorchGeometry(): THREE.BufferGeometry {
  return merged([
    disc(1.8, palette.groundScorch, Y),
    rockChunk(0.28, 0.6, 0.7, palette.wreckDark, 0.4).rotateY(0.4).translate(0.6, 0.06, 0.3),
    rockChunk(0.2, 0.6, 0.7, palette.wreckDark, 0.4).rotateY(0.9).translate(-0.55, 0.04, -0.4),
  ]);
}

/** A concrete sidewalk slab with a darker expansion-joint cross — city paving.
 *  Dead weeds push out of the joint and one corner has chipped to rubble. */
function slabGeometry(): THREE.BufferGeometry {
  const c = palette.curb;
  const s = palette.asphaltSeam;
  return merged([
    box(2.4, 0.04, 2.4, c, 0).translate(0, Y, 0),
    box(2.4, 0.05, 0.1, s, 0).translate(0, Y + 0.004, 0), // joint
    box(0.1, 0.05, 2.4, s, 0).translate(0, Y + 0.004, 0), // joint
    // Dead weeds pushed up through the joint.
    box(0.03, 0.16, 0.03, palette.pineTrunk, 0.35).rotateZ(0.2).translate(0.4, 0.04, 0.03),
    box(0.03, 0.12, 0.03, palette.pineTrunk, 0.35).rotateZ(-0.3).translate(0.46, 0.03, -0.02),
    box(0.03, 0.14, 0.03, palette.pineTrunk, 0.35).rotateX(0.25).translate(-0.03, 0.03, -0.7),
    // The chipped corner, broken down to craggy bits.
    rockChunk(0.14, 0.6, 0.7, s, 0.3).translate(1.05, 0.02, 1.05),
    rockChunk(0.1, 0.6, 0.7, c, 0.3).rotateY(0.8).translate(1.25, 0.015, 0.85),
  ]);
}

/** A manhole cover set in the asphalt: bolt ring, tread-pattern bars, and the
 *  lid shifted off its seat — something came up through it. */
function manholeGeometry(): THREE.BufferGeometry {
  const rim = palette.structureHaze;
  const lid = palette.asphaltSeam;
  return merged([
    disc(0.62, rim, Y),
    // The lid, shifted a hand's width off its seat, leaving a dark crescent.
    disc(0.55, palette.groundScorch, Y + 0.003),
    disc(0.5, lid, Y + 0.006).translate(0.12, 0, 0.06),
    // Tread bars across the lid face.
    box(0.6, 0.045, 0.06, rim, 0).translate(0.12, Y + 0.008, 0.2),
    box(0.7, 0.045, 0.06, rim, 0).translate(0.12, Y + 0.008, 0.06),
    box(0.6, 0.045, 0.06, rim, 0).translate(0.12, Y + 0.008, -0.08),
    // Bolt heads around the ring.
    box(0.07, 0.05, 0.07, lid, 0).translate(0.58, Y + 0.004, 0),
    box(0.07, 0.05, 0.07, lid, 0).translate(-0.58, Y + 0.004, 0),
    box(0.07, 0.05, 0.07, lid, 0).translate(0, Y + 0.004, 0.58),
    box(0.07, 0.05, 0.07, lid, 0).translate(0, Y + 0.004, -0.58),
  ]);
}

/** A heap of broken concrete masonry — the city already coming apart. */
function chunksGeometry(): THREE.BufferGeometry {
  const c = palette.curb;
  const d = palette.structureBase;
  return merged([
    disc(1.2, palette.asphaltSeam, Y),
    rockChunk(0.3, 0.7, 0.65, c, 0.4).rotateY(0.4).translate(0.5, 0.08, 0.2),
    rockChunk(0.24, 0.8, 0.7, d, 0.4).rotateY(0.9).translate(-0.5, 0.1, -0.3),
    rockChunk(0.26, 0.6, 0.7, c, 0.4).rotateY(-0.5).translate(0.1, 0.06, 0.5),
    rockChunk(0.16, 0.6, 0.7, d, 0.4).rotateY(1.2).translate(-0.1, 0.04, -0.6),
  ]);
}

/** Trampled ash and a dark stain with a few charred flecks — the overrun
 *  outskirts ground into the dirt (Swarm). */
function ashGeometry(): THREE.BufferGeometry {
  const fleck = palette.curb;
  return merged([
    disc(2.0, palette.groundScorch, Y),
    disc(1.2, palette.wreckDark, Y + 0.004).translate(0.8, 0, 0.5),
    box(0.3, 0.05, 0.3, fleck, 0).rotateY(0.5).translate(-0.7, Y + 0.008, -0.3),
    box(0.22, 0.05, 0.22, fleck, 0).rotateY(1.1).translate(0.5, Y + 0.008, -0.8),
  ]);
}

/** A small cluster of alien crystal shards pushing up through the ground, a glow
 *  in their core — the same growth as the horizon crystal, brought to the verge
 *  (Visitors). */
function shardsGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  const g = palette.ufoGlow;
  return merged([
    disc(0.95, palette.groundScorch, Y),
    paint(new THREE.ConeGeometry(0.28, 1.4, 5), b, 0.4).rotateZ(0.16).translate(0, 0.65, 0),
    paint(new THREE.ConeGeometry(0.2, 0.95, 5), b, 0.4).rotateZ(-0.45).translate(0.42, 0.42, 0.2),
    paint(new THREE.ConeGeometry(0.13, 1.05, 5), g, 0).translate(0, 0.6, 0), // glowing core
  ]);
}

/** A giant's stomped footprint: a dark depression ringed by crushed rubble shoved
 *  out of the impact (Colossus). */
function craterGeometry(): THREE.BufferGeometry {
  const c = palette.curb;
  return merged([
    disc(2.2, palette.meteorCrater, Y),
    disc(1.3, palette.asphaltSeam, Y + 0.004),
    rockChunk(0.32, 0.72, 0.65, c, 0.4).rotateY(0.4).translate(1.8, 0.09, 0.3),
    rockChunk(0.26, 0.8, 0.7, palette.structureBase, 0.4).rotateY(0.9).translate(-1.6, 0.1, -0.6),
    rockChunk(0.3, 0.62, 0.7, c, 0.4).rotateY(-0.5).translate(0.2, 0.07, 1.8),
  ]);
}

/** Fractured ground lifting into angled grey shards — the surface coming apart as
 *  reality frays (Static). */
function glitchGeometry(): THREE.BufferGeometry {
  const a = palette.spireBase;
  const b = palette.spireHaze;
  return merged([
    box(1.4, 0.06, 1.4, a, 0).rotateY(0.3).translate(0, Y, 0),
    box(0.8, 0.5, 0.8, b, 0.3).rotateZ(0.5).rotateY(0.4).translate(0.6, 0.18, 0.3),
    box(0.5, 0.7, 0.5, a, 0.3).rotateZ(-0.6).rotateY(0.8).translate(-0.6, 0.22, -0.4),
    box(0.3, 0.4, 0.3, b, 0.3).rotateX(0.7).translate(0.2, 0.14, -0.7),
  ]);
}

/** The scar an abduction beam left: a scorched ring with a dim glowing rim, the
 *  pavement inside swept unnaturally clean, crystal nubs sprouting at the edge
 *  (Visitors). The glow stays dim — a mark, never a pickup. */
function beamScarGeometry(): THREE.BufferGeometry {
  const g = palette.ufoBeam;
  const b = palette.crystalBody;
  return merged([
    disc(1.9, palette.groundScorch, Y),
    // The rim ring, faintly lit where the beam's edge burned.
    paint(new THREE.CylinderGeometry(1.45, 1.45, 0.03, 18, 1, true), g, 0.25).translate(0, Y + 0.005, 0),
    // Inside the ring: swept clean, a shade paler than the scorch.
    disc(1.3, palette.asphaltSeam, Y + 0.004),
    // Crystal nubs taking root along the rim.
    paint(new THREE.ConeGeometry(0.12, 0.5, 5), b, 0.4).rotateZ(0.2).translate(1.35, 0.22, 0.4),
    paint(new THREE.ConeGeometry(0.09, 0.35, 5), b, 0.4).rotateZ(-0.3).translate(-1.1, 0.16, -0.85),
    paint(new THREE.ConeGeometry(0.07, 0.3, 5), b, 0.4).translate(-0.3, 0.14, 1.4),
  ]);
}

/** The gouges something colossal left dragging a downed thing away: three long
 *  parallel scrapes with kicked-out lips, rubble shoved to a heap at the far end
 *  (Colossus). Reads with the craters: the giants use the ground. */
function dragMarkGeometry(): THREE.BufferGeometry {
  const lip = palette.curb;
  const parts: THREE.BufferGeometry[] = [];
  for (const [xo, len, w] of [
    [-0.8, 5.2, 0.5],
    [0.1, 6.0, 0.62],
    [0.95, 4.6, 0.44],
  ] as const) {
    // The gouge floor, dark, and its kicked-out lips.
    parts.push(box(w, 0.04, len, palette.meteorCrater, 0).rotateY(0.12).translate(xo, Y, 0));
    parts.push(box(0.12, 0.1, len * 0.8, lip, 0.35).rotateY(0.12).translate(xo - w * 0.62, Y + 0.03, 0.2));
    parts.push(box(0.12, 0.09, len * 0.7, lip, 0.4).rotateY(0.12).translate(xo + w * 0.62, Y + 0.03, -0.3));
  }
  // The heap where whatever was dragged finally left the ground.
  parts.push(rockChunk(0.3, 0.7, 0.6, lip, 0.4).rotateY(0.5).translate(0.3, 0.08, 3.1));
  parts.push(rockChunk(0.22, 0.75, 0.65, palette.structureBase, 0.4).rotateY(1.2).translate(-0.5, 0.07, 2.9));
  return merged(parts);
}

/** A patch where the ground de-rendered: a matte void pane sunk flush with the
 *  dirt, a cold seam along one edge, the pavement around it sliced into lifted
 *  steps (Static). The floor-scale echo of the rifts on the skyline. */
function voidMeltGeometry(): THREE.BufferGeometry {
  const a = palette.spireBase;
  const b = palette.spireHaze;
  return merged([
    // The pane: near-black, dead flat — a hole that renders as a surface.
    box(1.7, 0.04, 1.3, palette.tvDark, 0).rotateY(0.25).translate(0, Y, 0),
    // The cold seam along its long edge.
    box(1.5, 0.05, 0.07, palette.voidGlow, 0.2).rotateY(0.25).translate(-0.15, Y + 0.01, 0.62),
    // The pavement around it sliced into clean lifted steps.
    box(0.8, 0.14, 0.5, a, 0.3).rotateY(0.25).translate(1.1, 0.04, -0.5),
    box(0.55, 0.22, 0.4, b, 0.3).rotateY(0.55).translate(-1.15, 0.07, 0.3),
    box(0.4, 0.1, 0.35, a, 0.3).rotateY(-0.1).translate(-0.4, 0.03, -0.95),
  ]);
}

/** A settled snow patch: two soft pale lobes with a wind-lit crest (Ice Fields). */
function snowPatchGeometry(): THREE.BufferGeometry {
  return merged([
    disc(2.1, palette.snowBody, Y),
    disc(1.3, palette.snowBody, Y + 0.004).translate(1.6, 0, 0.7),
    disc(0.8, palette.snowLit, Y + 0.008).translate(0.4, 0, 0.2),
  ]);
}

/** A frozen melt sheet: a pale blue-grey plate with a cracked corner (Ice Fields). */
function iceSheetGeometry(): THREE.BufferGeometry {
  const g = palette.iceGlaze;
  return merged([
    box(2.2, 0.04, 1.7, g, 0).rotateY(0.2).translate(0, Y, 0),
    box(0.9, 0.05, 0.7, palette.snowLit, 0).rotateY(0.5).translate(0.6, Y + 0.004, 0.3),
    // The crack seaming across the plate.
    box(0.08, 0.06, 1.6, palette.groundScorch, 0).rotateY(-0.4).translate(-0.4, Y + 0.008, 0),
  ]);
}

/** A banked rippled dune tongue reaching toward the road (Dust Flats). */
function dunePatchGeometry(): THREE.BufferGeometry {
  const sand = palette.sandDune;
  return merged([
    disc(2.4, sand, Y),
    disc(1.5, sand, Y + 0.004).translate(1.9, 0, 0.9),
    // Ripple crests picked out by the shadowed shade tone.
    box(1.8, 0.04, 0.14, palette.sandShade, 0).rotateY(0.3).translate(0, Y + 0.008, 0.4),
    box(1.4, 0.04, 0.12, palette.sandShade, 0).rotateY(0.3).translate(0.3, Y + 0.008, -0.5),
  ]);
}

/** A downed service cable snaking across the tunnel floor with a junction box. */
function cableGeometry(): THREE.BufferGeometry {
  const c = palette.bridgeCable;
  return merged([
    box(0.12, 0.05, 2.6, c, 0.2).rotateY(0.2).translate(0, Y + 0.06, 0),
    box(0.1, 0.05, 1.8, c, 0.2).rotateY(-0.5).translate(0.5, Y + 0.06, 1.6),
    box(0.1, 0.05, 1.4, c, 0.2).rotateY(0.7).translate(-0.4, Y + 0.06, -1.7),
    box(0.4, 0.24, 0.3, palette.postCollar, 0.45).rotateY(0.4).translate(0.1, 0.08, 0.3),
  ]);
}

/** Whitecap streaks on the sea below the broken deck (Broken Bridge). Flat pale
 *  runs that stream past and read as chop, never as an object. */
function foamGeometry(): THREE.BufferGeometry {
  const f = palette.seaFoam;
  return merged([
    box(2.6, 0.03, 0.3, f, 0).rotateY(0.15).translate(0, Y, 0),
    box(1.7, 0.03, 0.22, f, 0).rotateY(-0.1).translate(0.8, Y, 1.2),
    box(1.2, 0.03, 0.18, f, 0).rotateY(0.3).translate(-0.9, Y, -1.1),
  ]);
}

/** An open molten pool: a glowing core inside a dark crust rim (Lava Fields). */
function lavaPoolGeometry(): THREE.BufferGeometry {
  return merged([
    disc(1.9, palette.basaltDark, Y),
    disc(1.4, palette.lavaPoolDeep, Y + 0.004),
    disc(0.85, palette.lavaPool, Y + 0.008),
    // A crust plate breaking the pool's clean circle.
    box(0.8, 0.08, 0.6, palette.basaltCool, 0.3).rotateY(0.5).translate(0.7, 0.02, 0.4),
  ]);
}

/** Fractured basalt plates shoved up through the crust (Lava Fields). */
function basaltChunkGeometry(): THREE.BufferGeometry {
  const dark = palette.basaltDark;
  const cool = palette.basaltCool;
  return merged([
    disc(1.1, palette.groundScorch, Y),
    box(0.6, 0.4, 0.5, dark, 0.5).rotateY(0.4).translate(0.3, 0.1, 0.2),
    box(0.45, 0.3, 0.4, cool, 0.45).rotateY(0.9).translate(-0.45, 0.08, -0.25),
    // One dim molten seam between the plates.
    box(0.5, 0.06, 0.08, palette.emberVein, 0.1).rotateY(0.6).translate(-0.05, 0.05, 0),
  ]);
}

/** Wind-blown street litter: a few faded paper sheets settled flat, one folded up
 *  against nothing (the city's last newspapers). Pale but dim — never a token read. */
function litterGeometry(): THREE.BufferGeometry {
  const sheet = palette.barrierPaint;
  const pale = palette.coupeStripe;
  return merged([
    box(0.5, 0.02, 0.7, pale, 0).rotateY(0.3).translate(0, Y, 0),
    box(0.44, 0.02, 0.62, sheet, 0).rotateY(-0.6).translate(0.8, Y + 0.004, 0.5),
    box(0.4, 0.02, 0.56, sheet, 0).rotateY(1.1).translate(-0.7, Y + 0.004, -0.4),
    // One sheet folded mid-tumble, caught on the ground.
    box(0.36, 0.02, 0.3, pale, 0).rotateX(0.5).rotateY(0.8).translate(0.2, 0.06, -0.7),
  ]);
}

/** A downed signpost: the pole across the dirt, the stop plate torn off beside a
 *  grey route plate. The stop red is dim and weathered — never a threat read. */
function signGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.08, 0.06, 2.0, palette.railPost, 0.35).rotateY(0.3).translate(0, Y + 0.05, 0),
    // The octagonal stop plate lying flat, and its pale mounting plate.
    paint(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 8), palette.signStop, 0.15).translate(
      0.75,
      Y + 0.03,
      0.75,
    ),
    box(0.5, 0.03, 0.68, palette.signPlate, 0.15).rotateY(-0.5).translate(-0.7, Y + 0.03, -0.6),
    // A snapped bracket still bolted to the pole.
    box(0.14, 0.08, 0.14, palette.railBeam, 0.3).translate(0.15, Y + 0.07, 0.85),
  ]);
}

/** Shattered storefront glass pooled on the paving, shards catching pale light. */
function glassGeometry(): THREE.BufferGeometry {
  const g = palette.glassShatter;
  return merged([
    disc(0.9, g, Y),
    disc(0.5, g, Y + 0.004).translate(0.8, 0, 0.4),
    // Larger shards standing proud of the pool.
    box(0.2, 0.03, 0.14, palette.coupeStripe, 0.1).rotateY(0.4).translate(0.3, Y + 0.02, 0.1),
    box(0.16, 0.03, 0.12, g, 0.1).rotateY(-0.8).translate(-0.35, Y + 0.02, -0.25),
    box(0.14, 0.03, 0.1, palette.coupeStripe, 0.1).rotateY(1.2).translate(0.05, Y + 0.02, -0.5),
    box(0.12, 0.03, 0.1, g, 0.1).rotateY(0.9).translate(0.75, Y + 0.02, 0.55),
  ]);
}

/** Burst evacuation luggage: a case dropped shut, one torn open, clothes strewn
 *  in a fan — the story of the people who ran. */
function luggageGeometry(): THREE.BufferGeometry {
  return merged([
    // One case dropped flat, still shut, handle up.
    box(0.52, 0.16, 0.38, palette.suitcaseTan, 0.4).rotateY(0.4).translate(0, 0.08, 0),
    box(0.14, 0.05, 0.06, palette.wreckDark, 0.3).rotateY(0.4).translate(0.02, 0.18, 0.2),
    // The second burst open: two halves hinged apart.
    box(0.46, 0.1, 0.34, palette.suitcaseBlue, 0.4).rotateY(-0.6).translate(0.75, 0.05, 0.5),
    paint(
      new THREE.BoxGeometry(0.46, 0.08, 0.34).rotateX(-0.9).rotateY(-0.6).translate(0.95, 0.16, 0.75),
      palette.suitcaseBlue,
      0.35,
    ),
    // Clothes strewn out of it — flat pale patches fanned downwind.
    box(0.3, 0.02, 0.24, palette.barrierPaint, 0.2).rotateY(0.7).translate(0.45, Y + 0.02, 0.15),
    box(0.26, 0.02, 0.2, palette.coupeStripe, 0.2).rotateY(-0.3).translate(-0.4, Y + 0.02, 0.4),
    box(0.22, 0.02, 0.18, palette.barrierPaint, 0.2).rotateY(1.1).translate(-0.15, Y + 0.02, -0.4),
  ]);
}

/** Bleached cattle bones settled into the dirt: rib arcs over a spine, the
 *  pelvis, the skull with its dark socket, a stray long bone. */
function bonesGeometry(): THREE.BufferGeometry {
  const bone = palette.zombieBone;
  return merged([
    box(0.06, 0.3, 0.06, bone, 0.3).rotateZ(0.5).translate(0, 0.12, 0),
    box(0.06, 0.34, 0.06, bone, 0.3).rotateZ(0.55).translate(0.02, 0.14, 0.18),
    box(0.06, 0.3, 0.06, bone, 0.3).rotateZ(0.6).translate(0.04, 0.12, 0.36),
    box(0.06, 0.26, 0.06, bone, 0.3).rotateZ(0.5).translate(0.02, 0.1, 0.54),
    box(0.08, 0.04, 0.85, bone, 0.25).translate(-0.12, 0.03, 0.3),
    box(0.2, 0.08, 0.16, bone, 0.3).translate(-0.14, 0.05, -0.15), // pelvis
    box(0.18, 0.12, 0.26, bone, 0.3).rotateY(0.4).translate(-0.1, 0.06, 0.85), // skull
    box(0.05, 0.06, 0.1, palette.groundScorch, 0).rotateY(0.4).translate(-0.03, 0.08, 0.94),
    box(0.05, 0.04, 0.4, bone, 0.25).rotateY(0.8).translate(0.42, 0.02, -0.2),
  ]);
}

/** Fence planks scattered where a section blew down, one pair still nailed. */
function planksGeometry(): THREE.BufferGeometry {
  const w = palette.postCollar;
  return merged([
    box(0.16, 0.03, 1.3, w, 0.25).rotateY(0.3).translate(0, Y + 0.05, 0),
    box(0.14, 0.03, 1.0, palette.husk, 0.25).rotateY(-0.4).translate(0.4, Y + 0.08, 0.3),
    box(0.15, 0.03, 1.1, w, 0.25).rotateY(0.9).translate(-0.5, Y + 0.05, -0.3),
    // The pair still nailed to a rail stub.
    box(0.5, 0.04, 0.14, palette.husk, 0.25).rotateY(0.3).translate(0.15, Y + 0.1, -0.55),
    box(0.14, 0.03, 0.9, w, 0.25).rotateY(0.32).translate(0.05, Y + 0.12, -0.5),
  ]);
}

/** Convoy ruts baked into the dirt: two parallel dark tracks with the kicked-out
 *  lips still holding their edge. */
function rutsGeometry(): THREE.BufferGeometry {
  const dark = palette.groundScorch;
  const lip = palette.groundSand;
  return merged([
    box(0.22, 0.02, 2.6, dark, 0).rotateY(0.12).translate(-0.45, Y, 0),
    box(0.22, 0.02, 2.6, dark, 0).rotateY(0.12).translate(0.45, Y, 0),
    box(0.08, 0.03, 2.2, lip, 0).rotateY(0.12).translate(-0.64, Y + 0.003, 0),
    box(0.08, 0.03, 2.2, lip, 0).rotateY(0.12).translate(0.64, Y + 0.003, 0),
    box(0.08, 0.03, 2.0, lip, 0).rotateY(0.12).translate(-0.26, Y + 0.003, 0.1),
  ]);
}

const GEOMETRY: Record<ScatterKind, () => THREE.BufferGeometry> = {
  drift: driftGeometry,
  crack: crackGeometry,
  scorch: scorchGeometry,
  slab: slabGeometry,
  manhole: manholeGeometry,
  chunks: chunksGeometry,
  ash: ashGeometry,
  shards: shardsGeometry,
  crater: craterGeometry,
  glitch: glitchGeometry,
  snowpatch: snowPatchGeometry,
  icesheet: iceSheetGeometry,
  dunepatch: dunePatchGeometry,
  cable: cableGeometry,
  foam: foamGeometry,
  lavapool: lavaPoolGeometry,
  basaltchunk: basaltChunkGeometry,
  litter: litterGeometry,
  sign: signGeometry,
  glass: glassGeometry,
  luggage: luggageGeometry,
  bones: bonesGeometry,
  planks: planksGeometry,
  ruts: rutsGeometry,
  beamscar: beamScarGeometry,
  dragmark: dragMarkGeometry,
  voidmelt: voidMeltGeometry,
};

export class GroundScatter {
  private readonly meshes: Record<ScatterKind, THREE.InstancedMesh>;
  private readonly counts: Record<ScatterKind, number>;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.meshes = {} as Record<ScatterKind, THREE.InstancedMesh>;
    this.counts = {} as Record<ScatterKind, number>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), propMaterial, CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      this.meshes[kind] = mesh;
      this.counts[kind] = 0;
      scene.add(mesh);
    }
  }

  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    for (const kind of KINDS) this.counts[kind] = 0;

    const first = Math.floor((distance - SPACING) / SPACING);
    const last = Math.ceil((distance + REACH) / SPACING);

    for (let slot = first; slot <= last; slot += 1) {
      for (const side of SIDES) {
        const key = slot * 2 + (side < 0 ? 0 : 1);
        // 70% of slots dress the dirt (was 50%): the floor should read busy.
        if (this.rand(key, 1) < 0.3) continue;

        const worldZ = slot * SPACING + (this.rand(key, 3) - 0.5) * SPACING;

        // Pick the act this slot's floor belongs to. Near a boundary, some slots
        // flip early to the next act so the ground rebuilds gradually into the next
        // catastrophe, the same slot-by-slot crossfade the skyline uses.
        const f = Math.max(0, worldZ) / ACT_SPAN;
        const ai = Math.min(Math.floor(f), ACT_SCATTER.length - 1);
        const frac = f - Math.floor(f);
        const t = frac <= 1 - TRANSITION_F ? 0 : (frac - (1 - TRANSITION_F)) / TRANSITION_F;
        const act = ai < ACT_SCATTER.length - 1 && t > 0 && this.rand(key, 7) < t ? ai + 1 : ai;
        // The geographic band overrides the act floor: snow settles over whatever
        // act owns the sky. Entering a band, slots flip one by one across the same
        // stretch the biome look blends over, so the floor rebuilds gradually.
        const band = Math.floor(Math.max(0, worldZ) / BIOME_BAND_M);
        const local = Math.max(0, worldZ) - band * BIOME_BAND_M;
        const inBlend = band > 0 && local < BIOME_TRANSITION_M;
        const useBand =
          inBlend && this.rand(key, 8) >= local / BIOME_TRANSITION_M ? band - 1 : band;
        const list = BIOME_SCATTER[biomeForBand(this.seed, useBand).id] ?? ACT_SCATTER[act];
        const kind = list[Math.min(list.length - 1, Math.floor(this.rand(key, 2) * list.length))];
        const n = this.counts[kind];
        if (n >= CAP) continue;
        const x = side * (INNER + this.rand(key, 4) * (OUTER - INNER));
        const scale = 0.7 + this.rand(key, 5) * 1.1;
        const yaw = this.rand(key, 6) * Math.PI;

        // Lie on the road's vertical profile at this forward, so the decal hugs
        // the undulating ground instead of floating where the terrain rises.
        this.dummy.position.set(x, elevation.yAt(worldZ, distance), distance - worldZ);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.meshes[kind].setMatrixAt(n, this.dummy.matrix);
        this.counts[kind] = n + 1;
      }
    }

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      const n = this.counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const kind of KINDS) this.meshes[kind].geometry.dispose();
  }
}
