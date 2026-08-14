"""Build the Blender-authored low-poly wreck van used by the road hazard.

Run from Blender's scripting workspace or from the command line:

    blender --background --python art/blender/wreck_van.py

The script writes the editable .blend beside itself and exports the runtime GLB
to src/assets/models (run `npm run models:optimize` afterwards to quantize it). Blender coordinates are X width, Y length, Z up. The nose
points toward -Y, which the glTF exporter maps to the game's +Z approach face.

Companion to wreck_sedan.py: same pipeline, palette, vertex-colour bake and
export settings, so the two share one instanced vertex-colour material at
runtime. The van is a crushed cargo body (roof caved in under the 0.9 m wreck
clearance, WRECK_CLEAR in src/sim/collision.ts) so it reads apart from the
sedan at the spawn horizon.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "wreck_van.blend"
GLB_PATH = ROOT / "src" / "assets" / "models" / "wreck-van.glb"


# Shares the warm wreck signature palette (src/render/palette.ts -> wreck*) with the
# sedan and truck: every abandoned car reads as one interactive class (warm,
# survivable blocker). Variety lives in the silhouette, never the colour.
PALETTE = {
    "body": 0x9C5236,
    "body_dark": 0x3A2C22,
    "cabin": 0x7C5D45,
    "stripe": 0xD07A24,
    "rust": 0x6F4527,
    "scorch": 0x1B1714,
    "glass": 0x394446,
    "glass_dark": 0x232B2C,
    "steel": 0x8A8A7C,
    "chrome": 0xC7C3AE,
    "rubber": 0x171719,
    "rim": 0x6E716C,
    "lamp": 0x6D211C,
    "amber": 0xE08A2A,
    "vinyl": 0x322722,
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
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Small authored bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish(obj, color, name)


def tapered_box(
    name: str,
    bottom: tuple[float, float],
    top: tuple[float, float],
    height: float,
    loc: tuple[float, float, float],
    color: str,
    top_shift: tuple[float, float] = (0.0, 0.0),
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
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
    obj.rotation_euler = rot
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


def wheel(name: str, x: float, y: float, z: float, outer: float = 0.30, steer: float = 0.0) -> None:
    # `outer` is the tyre's outer radius, so the wheel tucks predictably into its arch.
    # A chrome hubcap with a dark hub reads cleaner than an open spoke rim.
    minor = outer * 0.30
    major = outer - minor
    width = 0.26
    rot = (0.0, math.pi / 2, steer)
    torus(f"{name}_Tyre", major, minor, (x, y, z), "rubber", rot)
    cylinder(f"{name}_Dish", major * 0.9, width, (x, y, z), "chrome", rot, 8)
    cylinder(f"{name}_Hub", major * 0.32, width + 0.03, (x, y, z), "steel", rot, 6)


def build() -> bpy.types.Object:
    # Clear the default scene. This script is intentionally a full asset rebuild.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # Lower chassis slab running the full length, with a dark sill under the body.
    box("Sill", (1.94, 4.4, 0.3), (0.0, 0.0, 0.16), "body_dark")

    # The cargo box is the van's signature mass: tall and slab-sided, then crushed
    # low so its top holds under the 0.9 m wreck clearance (a caved-in roof, not a
    # wall you fly through). Set back over the rear axle.
    box("CargoBody", (1.9, 2.5, 0.6), (0.0, 0.55, 0.6), "body")
    box("CargoRoof", (1.78, 2.5, 0.06), (0.0, 0.55, 0.9), "cabin")
    # Caved-in crush: a sunken scorched panel and two crumple creases across the roof.
    box("RoofCrush", (1.34, 1.1, 0.12), (0.16, 0.7, 0.86), "scorch", (0.07, 0.0, 0.0))
    box("CrumpleFront", (1.84, 0.05, 0.42), (0.0, -0.68, 0.66), "body_dark")
    box("CrumpleSide", (0.05, 1.3, 0.42), (0.5, 0.7, 0.66), "body_dark")

    # Front cab: lower than the cargo box, with a raked windscreen that faces the
    # player (-Y). The three-mass read is nose, low cab, tall crushed box.
    box("Cab", (1.86, 1.1, 0.5), (0.0, -1.35, 0.52), "body")
    box("CabRoof", (1.72, 0.95, 0.06), (0.0, -1.3, 0.77), "cabin")
    tapered_box("Hood", (1.8, 0.7), (1.66, 0.42), 0.34, (0.0, -2.02, 0.42), "body", top_shift=(0.0, -0.12))
    polygon("Windscreen", [
        (-0.8, -0.92, 0.74), (0.8, -0.92, 0.74), (0.82, -1.2, 0.5), (-0.82, -1.2, 0.5),
    ], "glass")

    # A signature stripe down each flank so the colour reads at the horizon.
    for side in (-1, 1):
        box(f"Stripe_{side}", (0.03, 3.4, 0.16), (side * 0.96, 0.1, 0.6), "stripe")

    # Front face: a slim chrome bumper with a rubber strip, a dark grille, and dead
    # recessed headlamps (driver side scorched out).
    box("FrontBumper", (1.9, 0.22, 0.2), (0.0, -2.34, 0.3), "chrome")
    box("FrontBumperStrip", (1.76, 0.06, 0.05), (0.0, -2.42, 0.3), "rubber")
    box("Grille", (1.0, 0.06, 0.22), (0.0, -2.32, 0.5), "scorch")
    for side, lens in ((-1, "scorch"), (1, "glass_dark")):
        box(f"Headlamp_{side}", (0.34, 0.07, 0.16), (side * 0.66, -2.35, 0.5), "chrome")
        box(f"HeadlampLens_{side}", (0.28, 0.05, 0.12), (side * 0.66, -2.4, 0.5), lens)

    # Rear face: split cargo doors with a centre seam, red lamp clusters, a chrome
    # bumper, and the access ladder still bolted to the driver-side leaf.
    for side in (-1, 1):
        box(f"RearDoor_{side}", (0.86, 0.12, 0.74), (side * 0.46, 1.92, 0.58), "body")
    box("RearSeam", (0.05, 0.1, 0.74), (0.0, 1.96, 0.58), "body_dark")
    box("RearBumper", (1.9, 0.2, 0.18), (0.0, 2.02, 0.3), "chrome")
    for side in (-1, 1):
        box(f"TailLamp_{side}", (0.3, 0.06, 0.18), (side * 0.72, 1.98, 0.5), "lamp")
    box("LadderRailL", (0.04, 0.05, 0.62), (-0.72, 2.0, 0.58), "steel")
    box("LadderRailR", (0.04, 0.05, 0.62), (-0.38, 2.0, 0.58), "steel")
    for index, z in enumerate((0.36, 0.58, 0.8)):
        box(f"LadderRung_{index}", (0.34, 0.05, 0.04), (-0.55, 2.0, z), "steel")

    # Sliding-door outline and a chrome handle on the kerb flank.
    for index, y in enumerate((0.9, -0.1)):
        box(f"SlideSeam_{index}", (0.03, 0.05, 0.6), (0.97, y, 0.58), "body_dark")
    box("SlideHandle", (0.04, 0.18, 0.05), (0.98, 0.4, 0.62), "chrome")

    # Wing mirrors on the cab and a snapped whip aerial off the cab corner.
    for side in (-1, 1):
        box(f"MirrorArm_{side}", (0.12, 0.06, 0.05), (side * 0.98, -1.78, 0.62), "body")
        box(f"MirrorGlass_{side}", (0.04, 0.1, 0.12), (side * 1.06, -1.82, 0.63), "glass")
    cylinder("Aerial", 0.014, 0.24, (-0.68, -1.8, 0.72), "steel", (0.32, 0.1, 0.22), 6)

    # Rust eating the flanks and roof, plus a scorch streak from the crushed corner.
    box("RustFlank", (0.03, 0.7, 0.4), (0.96, 1.2, 0.62), "rust")
    box("RustRoof", (0.5, 0.5, 0.03), (-0.5, 1.2, 0.905), "rust")
    box("RustQuarter", (0.04, 0.5, 0.22), (-0.94, -0.6, 0.5), "rust")
    box("ScorchStreak", (0.04, 0.44, 0.3), (0.94, 1.3, 0.66), "scorch")

    # A roof vent on the cargo body.
    box("RoofVent", (0.32, 0.32, 0.08), (-0.3, 0.0, 0.9), "body_dark")

    # Wheel arches over both axles.
    for side in (-1, 1):
        box(f"ArchFront_{side}", (0.16, 1.0, 0.34), (side * 0.92, -1.4, 0.36), "body_dark")
        box(f"ArchRear_{side}", (0.16, 1.0, 0.34), (side * 0.92, 1.35, 0.36), "body_dark")

    # Wheels tucked into the arches; the rear-left is blown flat (a crushed dark
    # stub) so the wreck reads as beached, not parked.
    wheel("FrontLeft", -0.9, -1.4, 0.3)
    wheel("FrontRight", 0.9, -1.4, 0.3)
    wheel("RearRight", 0.9, 1.35, 0.3)
    box("FlatRearLeft", (0.62, 0.66, 0.24), (-0.9, 1.35, 0.16), "body_dark")

    # Join every authored piece into one geometry. Material colors become a single
    # COLOR_0 attribute, so runtime can keep one shared vertex-color material.
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    wreck = bpy.context.object
    wreck.name = "WreckVan"
    wreck.data.name = "WreckVan_Mesh"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Hard contract with the sim: WRECK_CLEAR (src/sim/collision.ts) is 0.9 m and a
    # hop clears the hitbox at that height, so the silhouette is clamped under it —
    # the car must never visibly fly through the tallest panel. Location is applied
    # first so the vertices are measured (and the clamp pivots) in world space: the
    # join leaves the origin at the first part's location, above the ground plane.
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    top = max(vert.co.z for vert in wreck.data.vertices)
    if top > 0.9:
        wreck.scale = (1.0, 1.0, 0.9 / top)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    color_attribute = wreck.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for face in wreck.data.polygons:
        mat = wreck.data.materials[face.material_index]
        base = mat.diffuse_color
        shade = 0.7 + 0.3 * ((face.normal.z + 1.0) * 0.5)
        for loop_index in face.loop_indices:
            color_attribute.data[loop_index].color = (
                min(1.0, base[0] * shade),
                min(1.0, base[1] * shade),
                min(1.0, base[2] * shade),
                1.0,
            )
    wreck.data.color_attributes.active_color = color_attribute
    wreck.data.color_attributes.render_color_index = wreck.data.color_attributes.find(color_attribute.name)
    wreck.data.materials.clear()
    wreck.data.materials.append(material("VertexColorPreview", 0xFFFFFF))
    wreck.data.polygons.foreach_set("material_index", [0] * len(wreck.data.polygons))

    # Preview material multiplies the baked color in Blender, matching Three.js.
    preview = wreck.data.materials[0]
    nodes = preview.node_tree.nodes
    links = preview.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = color_attribute.name
    links.new(vertex.outputs["Color"], bsdf.inputs["Base Color"])

    # Stable source metadata used by import checks and future Blender tooling.
    wreck["asset_kind"] = "wreck"
    wreck["game_dimensions_m"] = [2.15, 4.55, 0.9]
    wreck["collision_clearance_m"] = 0.9
    wreck["front_axis_blender"] = "-Y"

    return wreck


def save_and_export(wreck: bpy.types.Object) -> None:
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.object.select_all(action="DESELECT")
    wreck.select_set(True)
    bpy.context.view_layer.objects.active = wreck
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
    wreck = bpy.data.objects.get("WreckVan")
    if wreck:
        wreck.select_set(True)
        bpy.context.view_layer.objects.active = wreck
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.shading.light = "STUDIO"
            space.shading.studio_light = "studio.exr"
            space.region_3d.view_distance = 6.4
            space.region_3d.view_location = (0.0, 0.0, 0.55)


wreck = build()
save_and_export(wreck)
frame_viewport()
print(f"Built {wreck.name}: {len(wreck.data.vertices)} vertices, {len(wreck.data.polygons)} faces")
print(f"Saved {BLEND_PATH}")
print(f"Exported {GLB_PATH}")
