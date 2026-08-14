"""Build the Blender-authored low-poly toppled big rig, the tallest lethal wall.

Run from Blender's scripting workspace or from the command line:

    blender --background --python art/blender/rig.py

The script writes the editable .blend beside itself and exports the runtime GLB
to src/assets/models (run `npm run models:optimize` afterwards to quantize it).
Blender coordinates are X width, Y length, Z up. The trailer's rear doors with
the amber chevrons point toward -Y, which the glTF exporter maps to the game's
+Z approach face — the render's `rigGlow` frames that face at game z ~ 2.0
(hot bars at x ±1.14) with beacon studs riding the 3.55 m top chord, so the
door face and the roof edge must stay there. The jackknifed cab swings off the
front with its windshield twisted back toward the player. No 0.9 m silhouette
clamp: the rig is a lethal wall and must read massive at the spawn horizon.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "rig.blend"
GLB_PATH = ROOT / "src" / "assets" / "models" / "rig.glb"


# Signature tones come from src/render/palette.ts (rigBody, rigHazard, ...):
# the warm red-brown trailer with bold amber chevrons is the class read.
PALETTE = {
    "body": 0x9A3F24,
    "body_dark": 0x6E2D1A,
    "cab": 0x8A5A36,
    "dark": 0x241B16,
    "hazard": 0xF0B22E,
    "rust": 0x6F4527,
    "scorch": 0x1B1714,
    "glass": 0x394446,
    "grille": 0x16171B,
    "chrome": 0x9092A0,
    "steel": 0x8A8A7C,
    "rubber": 0x171719,
    "taillight": 0x6F1A0E,
    "tarp": 0x4A5242,
}


def srgb_to_linear(channel: float) -> float:
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def rgba(hex_color: int) -> tuple[float, float, float, float]:
    return (
        srgb_to_linear(((hex_color >> 16) & 255) / 255),
        srgb_to_linear(((hex_color >> 8) & 255) / 255),
        srgb_to_linear((hex_color & 255) / 255),
        1.0,
    )


def material(name: str, hex_color: int) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = rgba(hex_color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba(hex_color)
        bsdf.inputs["Roughness"].default_value = 0.82
        bsdf.inputs["Metallic"].default_value = 0.0
    return mat


MATERIALS = {name: material(name, color) for name, color in PALETTE.items()}
PARTS: list[bpy.types.Object] = []


def finish(obj: bpy.types.Object, color: str, name: str) -> bpy.types.Object:
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(MATERIALS[color])
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    PARTS.append(obj)
    return obj


def box(
    name: str,
    dims: tuple[float, float, float],
    loc: tuple[float, float, float],
    color: str,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, color, name)


def cylinder(
    name: str,
    radius: float,
    depth: float,
    loc: tuple[float, float, float],
    color: str,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, color, name)


def dual_wheels(name: str, x: float, y: float, yaw: float = 0.0) -> None:
    # A trailer dual pair reads as one wide drum with a recessed hub; modelling
    # both tyres would double the vertices for detail the arch shadow eats.
    rot = (0.0, math.pi / 2, yaw)
    cylinder(f"{name}_Duals", 0.44, 0.56, (x, y, 0.44), "rubber", rot, 10)
    cylinder(f"{name}_Hub", 0.17, 0.62, (x, y, 0.44), "dark", rot, 6)


def build() -> bpy.types.Object:
    # Clear the default scene. This script is intentionally a full asset rebuild.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # ---- Trailer: the wall itself, filling the lethal hitbox and then some.
    box("Underframe", (2.34, 5.4, 0.42), (0.0, 0.6, 0.36), "dark")
    box("TrailerBody", (2.3, 5.0, 2.86), (0.0, 0.6, 2.06), "body")
    box("TopChord", (2.36, 5.04, 0.18), (0.0, 0.6, 3.55), "dark")
    box("BottomChord", (2.36, 5.04, 0.14), (0.0, 0.6, 0.62), "dark")
    # Vertical stiffening ribs down each flank: the corrugated-box read.
    for side in (-1, 1):
        for index, ry in enumerate((-1.4, -0.6, 0.2, 1.0, 1.8, 2.6)):
            box(f"Rib_{side}_{index}", (0.06, 0.16, 2.7), (side * 1.17, ry, 2.05), "body_dark")

    # ---- Rear doors, the face the player reads (game +Z ~ 2.0). Amber hazard
    # chevrons flank a dark center leaf; the glow bars frame this at x ±1.14.
    box("DoorFrame", (2.3, 0.18, 2.95), (0.0, -1.95, 2.0), "dark")
    box("ChevronLeft", (0.62, 0.2, 2.6), (-0.72, -2.0, 1.95), "hazard")
    box("DoorCenter", (0.62, 0.2, 2.6), (0.0, -2.0, 1.95), "dark")
    box("ChevronRight", (0.62, 0.2, 2.6), (0.72, -2.0, 1.95), "hazard")
    box("LockBar", (0.08, 0.24, 2.4), (-0.06, -2.02, 1.85), "cab")
    box("LockHandle", (0.12, 0.26, 0.3), (-0.06, -2.04, 1.3), "cab")
    for side in (-1, 1):
        for hz in (0.9, 2.9):
            box(f"Hinge_{side}_{hz}", (0.1, 0.24, 0.18), (side * 1.12, -1.98, hz), "steel")
        box(f"MarkerLamp_{side}", (0.3, 0.1, 0.12), (side * 0.8, -2.05, 0.62), "taillight")
        box(f"Mudflap_{side}", (0.5, 0.06, 0.42), (side * 0.75, -1.86, 0.22), "dark")
    box("UnderrideBar", (1.9, 0.12, 0.12), (0.0, -2.0, 0.34), "dark")

    # ---- Bogie: tandem axles near the doors, dual drums each side, and the
    # cranked-down landing gear near the trailer nose.
    for ay in (-0.7, -1.5):
        box(f"AxleBeam_{ay}", (2.1, 0.16, 0.16), (0.0, ay, 0.4), "dark")
        dual_wheels(f"Bogie_{ay}_L", -0.94, ay)
        dual_wheels(f"Bogie_{ay}_R", 0.94, ay)
    for side in (-1, 1):
        box(f"LandingLeg_{side}", (0.12, 0.12, 0.55), (side * 0.7, 2.6, 0.32), "steel")
        box(f"LandingFoot_{side}", (0.24, 0.24, 0.08), (side * 0.7, 2.6, 0.06), "steel")

    # Trailer nose: a dark bulkhead panel and a dangerous-goods diamond so the
    # front face is authored too, not a bare slab.
    box("NosePanel", (1.6, 0.08, 1.2), (0.0, 3.16, 1.6), "dark")
    box("NosePlacard", (0.44, 0.06, 0.44), (0.0, 3.2, 2.5), "hazard", (0.0, math.pi / 4, 0.0))

    # ---- Authored damage on the trailer: rust scabs, a long gouged scrape,
    # and a torn tarp corner flapped over the top rear edge.
    box("RustFlankLeft", (0.06, 1.0, 0.9), (-1.16, 1.9, 2.15), "rust")
    box("RustFlankRight", (0.06, 0.8, 0.7), (1.16, 0.2, 1.5), "rust")
    box("Scrape", (0.06, 2.6, 0.22), (-1.17, 0.6, 1.2), "scorch")
    box("TarpCorner", (0.9, 0.7, 0.06), (-0.65, -1.55, 3.6), "tarp", (0.3, 0.08, 0.0))

    # ---- Jackknifed cab off the trailer nose, twisted so its dead windshield
    # faces back toward the player. Everything shares the same 0.5 rad swing.
    yaw = 0.5
    box("CabBody", (2.0, 2.2, 1.5), (0.8, 3.5, 0.95), "cab", (0.0, 0.0, yaw))
    box("CabRoof", (1.9, 1.9, 0.5), (0.75, 3.6, 1.9), "cab", (0.0, 0.0, yaw))
    box("WindDeflector", (1.7, 0.9, 0.5), (0.42, 4.05, 2.25), "cab", (0.35, 0.0, yaw))
    box("Windshield", (1.8, 0.14, 0.8), (0.55, 2.6, 1.5), "glass", (0.0, 0.0, yaw))
    box("CabGrille", (1.6, 0.14, 0.5), (0.62, 2.52, 0.62), "grille", (0.0, 0.0, yaw))
    box("CabBumper", (1.9, 0.22, 0.3), (0.68, 2.46, 0.3), "dark", (0.0, 0.0, yaw))
    box("CabLampDead", (0.34, 0.14, 0.14), (0.12, 2.68, 0.62), "glass", (0.0, 0.0, yaw))
    box("CabLampScorched", (0.34, 0.14, 0.14), (1.16, 2.24, 0.62), "scorch", (0.0, 0.0, yaw))
    # Back of the cab: an inset sleeper panel with a dead window slit, so the
    # cab reads authored from behind, not a bare crate.
    box("CabBackPanel", (1.8, 0.12, 1.15), (0.27, 4.45, 0.95), "body_dark", (0.0, 0.0, yaw))
    box("CabBackWindow", (0.7, 0.1, 0.3), (0.32, 4.52, 1.35), "glass", (0.0, 0.0, yaw))
    # Door glass and handle on the exposed right flank.
    box("CabDoorGlass", (0.08, 0.7, 0.45), (1.66, 3.9, 1.4), "glass", (0.0, 0.0, yaw))
    box("CabDoorHandle", (0.07, 0.22, 0.06), (1.72, 3.62, 1.05), "dark", (0.0, 0.0, yaw))
    cylinder("ExhaustStack", 0.07, 1.5, (1.5, 4.3, 1.9), "dark", vertices=8)
    box("StackCap", (0.18, 0.18, 0.18), (1.5, 4.3, 2.72), "dark")
    box("Mirror", (0.08, 0.28, 0.42), (1.62, 2.7, 1.7), "chrome", (0.0, 0.0, yaw))
    cylinder("FuelTank", 0.3, 1.0, (1.52, 3.35, 0.5), "chrome", (math.pi / 2, 0.0, yaw), 10)
    dual_wheels("CabFront", 1.42, 3.95, yaw)
    dual_wheels("CabRear", 0.34, 2.95, yaw)

    # ---- Spilled cargo strewn toward the player: crates and a burst pallet,
    # the debris apron that sells the crash.
    box("CrateBig", (1.0, 1.0, 0.6), (-1.2, -2.7, 0.3), "rust", (0.0, 0.0, 0.4))
    box("CrateMid", (0.7, 0.7, 0.5), (0.4, -3.0, 0.25), "dark", (0.0, 0.0, 0.8))
    box("CrateSmall", (0.5, 0.5, 0.35), (-0.3, -3.3, 0.18), "cab", (0.0, 0.0, 1.1))
    box("Pallet", (0.9, 0.7, 0.08), (0.9, -2.6, 0.05), "body_dark", (0.0, 0.0, 0.25))

    # Join every authored piece into one geometry. Material colors become a single
    # COLOR_0 attribute, so runtime can keep one shared vertex-color material.
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    rig = bpy.context.object
    rig.name = "ToppledRig"
    rig.data.name = "ToppledRig_Mesh"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    color_attribute = rig.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for face in rig.data.polygons:
        mat = rig.data.materials[face.material_index]
        base = mat.diffuse_color
        shade = 0.7 + 0.3 * ((face.normal.z + 1.0) * 0.5)
        for loop_index in face.loop_indices:
            color_attribute.data[loop_index].color = (
                min(1.0, base[0] * shade),
                min(1.0, base[1] * shade),
                min(1.0, base[2] * shade),
                1.0,
            )
    rig.data.color_attributes.active_color = color_attribute
    rig.data.color_attributes.render_color_index = rig.data.color_attributes.find(color_attribute.name)
    rig.data.materials.clear()
    rig.data.materials.append(material("VertexColorPreview", 0xFFFFFF))
    rig.data.polygons.foreach_set("material_index", [0] * len(rig.data.polygons))

    # Preview material multiplies the baked color in Blender, matching Three.js.
    preview = rig.data.materials[0]
    nodes = preview.node_tree.nodes
    links = preview.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = color_attribute.name
    links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])

    # Stable source metadata used by import checks and future Blender tooling.
    rig["asset_kind"] = "rig"
    rig["game_dimensions_m"] = [3.4, 8.4, 3.6]
    rig["approach_face_blender"] = "-Y"

    return rig


def save_and_export(rig: bpy.types.Object) -> None:
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_attributes=True,
        # Vertex colors carry the whole look; UVs would only pad every vertex.
        export_texcoords=False,
        export_vertex_color="ACTIVE",
        export_cameras=False,
        export_lights=False,
    )


def frame_viewport() -> None:
    rig = bpy.data.objects.get("ToppledRig")
    if rig:
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.shading.light = "STUDIO"
            space.shading.studio_light = "studio.exr"
            space.region_3d.view_distance = 10.5
            space.region_3d.view_location = (0.0, 0.0, 1.7)


rig = build()
save_and_export(rig)
frame_viewport()
print(f"Built {rig.name}: {len(rig.data.vertices)} vertices, {len(rig.data.polygons)} faces")
print(f"Saved {BLEND_PATH}")
print(f"Exported {GLB_PATH}")
