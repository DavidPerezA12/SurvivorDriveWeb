"""Build the Blender-authored low-poly crashed bus, the longest lethal wall.

Run from Blender's scripting workspace or from the command line:

    blender --background --python art/blender/bus.py

The script writes the editable .blend beside itself and exports the runtime GLB
to src/assets/models (run `npm run models:optimize` afterwards to quantize it).
Blender coordinates are X width, Y length, Z up. The rear engine face with the
red chevrons points toward -Y, which the glTF exporter maps to the game's +Z
approach face — the render's `busGlow` bars anchor to that face at game
z ~ 4.0, so the rear extremity must stay there. Unlike the wrecks there is no
0.9 m silhouette clamp: the bus is a lethal wall and must read massive (its
low hitbox, `BUS_CLEAR`, is a sim rule, not a visual one).
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "bus.blend"
GLB_PATH = ROOT / "src" / "assets" / "models" / "bus.glb"


# Signature tones come from src/render/palette.ts (busBody, busDanger, ...):
# the faded ochre coach and the red rear chevrons are the class read.
PALETTE = {
    "body": 0xB0852C,
    "body_dark": 0x6E5320,
    "roof": 0x8A6A2A,
    "dark": 0x281F16,
    "rail": 0x141008,
    "glass": 0x33403F,
    "glass_dark": 0x151D1C,
    "rust": 0x6F4A24,
    "scorch": 0x1B1714,
    "danger": 0xE6361B,
    "stripe": 0xCFC8B8,
    "taillight": 0x6F1A0E,
    "grille": 0x16171B,
    "chrome": 0x9092A0,
    "steel": 0x8A8A7C,
    "rubber": 0x171719,
    "amber": 0xE08A2A,
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


def tapered_box(
    name: str,
    bottom: tuple[float, float],
    top: tuple[float, float],
    height: float,
    loc: tuple[float, float, float],
    color: str,
    top_shift: tuple[float, float] = (0.0, 0.0),
) -> bpy.types.Object:
    bw, bl = bottom
    tw, tl = top
    sx, sy = top_shift
    z0 = -height / 2
    z1 = height / 2
    verts = [
        (-bw / 2, -bl / 2, z0),
        (bw / 2, -bl / 2, z0),
        (bw / 2, bl / 2, z0),
        (-bw / 2, bl / 2, z0),
        (sx - tw / 2, sy - tl / 2, z1),
        (sx + tw / 2, sy - tl / 2, z1),
        (sx + tw / 2, sy + tl / 2, z1),
        (sx - tw / 2, sy + tl / 2, z1),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return finish(obj, color, name)


def extruded_profile(
    name: str,
    profile: list[tuple[float, float]],
    width: float,
    color: str,
) -> bpy.types.Object:
    """Extrude a side silhouette (Y, Z) across X, preserving wheel-arch cutouts."""
    half = width / 2
    count = len(profile)
    verts = [(-half, y, z) for y, z in profile] + [(half, y, z) for y, z in profile]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, color, name)


def polygon(name: str, verts: list[tuple[float, float, float]], color: str) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
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


def torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    loc: tuple[float, float, float],
    color: str,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=8,
        minor_segments=3,
        location=loc,
        rotation=rot,
    )
    return finish(bpy.context.object, color, name)


def wheel(name: str, x: float, y: float) -> None:
    # Coach wheel: a 0.5 m tyre with a steel dish and hub, tucked into its arch.
    outer = 0.5
    minor = outer * 0.30
    major = outer - minor
    rot = (0.0, math.pi / 2, 0.0)
    torus(f"{name}_Tyre", major, minor, (x, y, outer), "rubber", rot)
    cylinder(f"{name}_Dish", major * 0.88, 0.3, (x, y, outer), "steel", rot, 8)
    cylinder(f"{name}_Hub", major * 0.3, 0.34, (x, y, outer), "dark", rot, 6)


def flat_wheel(name: str, x: float, y: float) -> None:
    # The blown front tyre: a slumped rubber pad with the rim dropped into it.
    box(f"{name}_Tyre", (0.32, 0.88, 0.32), (x, y, 0.17), "rubber")
    cylinder(f"{name}_Rim", 0.3, 0.3, (x, y, 0.34), "steel", (0.14, math.pi / 2, 0.0), 8)
    cylinder(f"{name}_Hub", 0.11, 0.34, (x, y, 0.34), "dark", (0.14, math.pi / 2, 0.0), 6)


def build() -> bpy.types.Object:
    # Clear the default scene. This script is intentionally a full asset rebuild.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # The whole flank as one silhouette extruded across the width: a long slab
    # with two wheel arches cut in, a raked nose at +Y, a chamfered rear top at
    # -Y (the face the player approaches). CCW in the Y-Z plane.
    body_profile = [
        (-4.04, 1.84),  # rear top chamfer start
        (-4.02, 0.20),  # rear bottom
        (-3.38, 0.20),  # rear arch
        (-3.35, 1.05),
        (-2.05, 1.05),
        (-2.02, 0.20),
        (2.35, 0.20),  # long skirt
        (2.38, 1.05),  # front arch
        (3.68, 1.05),
        (3.71, 0.20),
        (4.55, 0.20),  # nose
        (4.70, 0.62),
        (4.74, 1.30),  # windshield base
        (4.50, 2.00),  # windshield top, raked back
        (4.38, 2.04),  # front roof edge
        (-3.90, 2.04),  # roofline
    ]
    extruded_profile("Body", body_profile, 1.98, "body")

    # Cambered roof cap, escape hatches (one blown open), and a sagging AC pod.
    tapered_box("RoofCap", (1.98, 8.2), (1.66, 7.86), 0.2, (0.0, 0.25, 2.12), "roof")
    box("HatchFront", (0.68, 0.68, 0.07), (0.0, 2.0, 2.24), "dark")
    box("HatchRear", (0.68, 0.68, 0.07), (0.0, -1.2, 2.24), "dark")
    box("HatchRearLid", (0.66, 0.66, 0.05), (0.0, -1.58, 2.3), "dark", (0.55, 0.0, 0.0))
    box("ACPod", (1.05, 1.6, 0.14), (0.08, 0.35, 2.26), "dark", (0.05, 0.0, 0.02))

    # Dead window band down each flank, broken into panes by body pillars, over
    # a bone livery stripe and a black rub rail. One pane popped out (dark).
    for side in (-1, 1):
        x = side * 1.0
        box(f"WindowBand_{side}", (0.05, 6.8, 0.6), (x, 0.05, 1.55), "glass")
        for index, py in enumerate((-2.2, -1.05, 0.1, 1.25, 2.4)):
            box(f"Pillar_{side}_{index}", (0.06, 0.16, 0.64), (x, py, 1.55), "body")
        box(f"Stripe_{side}", (0.045, 7.5, 0.12), (x, -0.15, 1.14), "stripe")
        # The rub rail runs in three segments so it never floats across the
        # open wheel arches.
        box(f"RubRailRear_{side}", (0.05, 0.55, 0.16), (x, -3.68, 0.45), "rail")
        box(f"RubRailMid_{side}", (0.05, 4.3, 0.16), (x, 0.17, 0.45), "rail")
        box(f"RubRailFront_{side}", (0.05, 0.45, 0.16), (x, 3.97, 0.45), "rail")
    box("PoppedPane", (0.06, 0.95, 0.56), (-1.005, -1.62, 1.55), "glass_dark")

    # Front (away from the player): raked windshield with a dark crack shard,
    # a dead destination panel on the cap, headlamps (one dead), and a bumper.
    polygon("Windshield", [
        (-0.84, 4.73, 1.38), (0.84, 4.73, 1.38), (0.78, 4.55, 1.94), (-0.78, 4.55, 1.94),
    ], "glass")
    # A shattered corner region rather than a floating shard: anchored to the
    # left windshield edge so it reads as impact damage.
    polygon("WindshieldCrack", [
        (-0.84, 4.735, 1.40), (-0.2, 4.67, 1.7), (-0.72, 4.6, 1.88),
    ], "glass_dark")
    box("DestPanel", (1.3, 0.06, 0.16), (0.0, 4.42, 2.12), "scorch")
    box("DestRemnant", (0.38, 0.05, 0.09), (-0.28, 4.44, 2.12), "amber")
    for side, lens in ((-1, "glass_dark"), (1, "glass")):
        x = side * 0.68
        box(f"HeadlampTrim_{side}", (0.36, 0.05, 0.2), (x, 4.72, 0.88), "chrome")
        box(f"HeadlampLens_{side}", (0.3, 0.05, 0.16), (x, 4.74, 0.88), lens)
    box("FrontBumper", (2.0, 0.16, 0.28), (0.0, 4.7, 0.34), "dark")

    # The passenger door ajar at the front right: a dark opening with the leaf
    # swung out on its hinge. A folded mirror survives that side; the other is
    # a torn stub.
    box("DoorOpening", (0.07, 0.6, 1.5), (0.99, 4.05, 1.05), "dark")
    box("DoorLeaf", (0.05, 0.58, 1.46), (1.06, 4.38, 1.03), "body", (0.0, 0.0, 0.35))
    box("DoorGlass", (0.04, 0.4, 0.5), (1.1, 4.4, 1.5), "glass_dark", (0.0, 0.0, 0.35))
    box("DriverWindow", (0.05, 0.5, 0.55), (-1.0, 4.15, 1.62), "glass")
    box("MirrorFolded", (0.05, 0.12, 0.26), (1.02, 4.5, 1.85), "chrome")
    box("MirrorStub", (0.12, 0.06, 0.05), (-1.0, 4.52, 1.9), "dark")

    # Rear, the face the player reads: engine panel, red hazard chevrons (the
    # lethal read, matching the glow bars that frame this face), dead lights,
    # the engine grille, and a sagging dented bumper.
    box("EnginePanel", (1.96, 0.1, 1.2), (0.0, -4.06, 1.15), "dark")
    box("ChevronLeft", (0.58, 0.1, 1.15), (-0.64, -4.1, 1.15), "danger")
    box("ChevronMid", (0.58, 0.1, 1.15), (0.0, -4.09, 1.15), "body")
    box("ChevronRight", (0.58, 0.1, 1.15), (0.64, -4.1, 1.15), "danger")
    box("TaillightLeft", (0.24, 0.05, 0.14), (-0.85, -4.12, 0.52), "taillight")
    box("TaillightRight", (0.24, 0.05, 0.14), (0.85, -4.12, 0.52), "taillight")
    box("GrilleRecess", (1.4, 0.07, 0.36), (0.0, -4.1, 0.5), "grille")
    for index, gz in enumerate((0.4, 0.52, 0.64)):
        box(f"GrilleSlat_{index}", (1.28, 0.05, 0.06), (0.0, -4.13, gz), "steel")
    box("RearBumper", (2.02, 0.18, 0.26), (0.0, -4.1, 0.28), "dark", (0.1, 0.0, 0.0))
    box("BumperScorch", (0.5, 0.16, 0.24), (0.78, -4.12, 0.3), "scorch", (0.1, 0.0, 0.05))

    # Authored damage: rust eating both flanks, a caved-in panel, a long scrape
    # gouged below the stripe, and darker recesses shading each wheel arch.
    box("RustFlankLeft", (0.05, 1.15, 0.5), (-1.0, -1.3, 0.78), "rust")
    box("RustFlankRight", (0.05, 0.85, 0.42), (1.0, 1.7, 0.88), "rust")
    box("RustSkirt", (0.05, 0.7, 0.28), (1.0, -3.7, 0.4), "rust")
    box("CavedPanel", (0.16, 0.9, 0.6), (1.0, -1.5, 0.75), "body_dark", (0.0, 0.0, 0.08))
    box("Scrape", (0.04, 2.6, 0.12), (-1.0, 0.4, 0.62), "scorch")
    # The recess wall sits inboard of the tyre so the wheel stays visible in
    # the arch instead of being papered over by a dark slab.
    for side in (-1, 1):
        box(f"ArchRecessRear_{side}", (0.2, 1.26, 1.0), (side * 0.62, -2.7, 0.51), "dark")
        box(f"ArchRecessFront_{side}", (0.2, 1.26, 1.0), (side * 0.62, 3.03, 0.51), "dark")

    # Wheels: both rear, the front right, and the blown front left.
    wheel("RearLeft", -0.8, -2.7)
    wheel("RearRight", 0.8, -2.7)
    wheel("FrontRight", 0.8, 3.03)
    flat_wheel("FrontLeft", -0.8, 3.03)

    # Join every authored piece into one geometry. Material colors become a single
    # COLOR_0 attribute, so runtime can keep one shared vertex-color material.
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    bus = bpy.context.object
    bus.name = "CrashedBus"
    bus.data.name = "CrashedBus_Mesh"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    color_attribute = bus.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for face in bus.data.polygons:
        mat = bus.data.materials[face.material_index]
        base = mat.diffuse_color
        shade = 0.7 + 0.3 * ((face.normal.z + 1.0) * 0.5)
        for loop_index in face.loop_indices:
            color_attribute.data[loop_index].color = (
                min(1.0, base[0] * shade),
                min(1.0, base[1] * shade),
                min(1.0, base[2] * shade),
                1.0,
            )
    bus.data.color_attributes.active_color = color_attribute
    bus.data.color_attributes.render_color_index = bus.data.color_attributes.find(color_attribute.name)
    bus.data.materials.clear()
    bus.data.materials.append(material("VertexColorPreview", 0xFFFFFF))
    bus.data.polygons.foreach_set("material_index", [0] * len(bus.data.polygons))

    # Preview material multiplies the baked color in Blender, matching Three.js.
    preview = bus.data.materials[0]
    nodes = preview.node_tree.nodes
    links = preview.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = color_attribute.name
    links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])

    # Stable source metadata used by import checks and future Blender tooling.
    bus["asset_kind"] = "bus"
    bus["game_dimensions_m"] = [2.1, 8.9, 2.3]
    bus["approach_face_blender"] = "-Y"

    return bus


def save_and_export(bus: bpy.types.Object) -> None:
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.object.select_all(action="DESELECT")
    bus.select_set(True)
    bpy.context.view_layer.objects.active = bus
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
    bus = bpy.data.objects.get("CrashedBus")
    if bus:
        bus.select_set(True)
        bpy.context.view_layer.objects.active = bus
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.shading.light = "STUDIO"
            space.shading.studio_light = "studio.exr"
            space.region_3d.view_distance = 9.5
            space.region_3d.view_location = (0.0, 0.0, 1.1)


bus = build()
save_and_export(bus)
frame_viewport()
print(f"Built {bus.name}: {len(bus.data.vertices)} vertices, {len(bus.data.polygons)} faces")
print(f"Saved {BLEND_PATH}")
print(f"Exported {GLB_PATH}")
