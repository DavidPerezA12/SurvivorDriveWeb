"""Build the Blender-authored low-poly wreck sedan used by the road hazard.

Run from Blender's scripting workspace or from the command line:

    blender --background --python art/blender/wreck_sedan.py

The script writes the editable .blend beside itself and exports the runtime GLB
to src/assets/models (run `npm run models:optimize` afterwards to quantize it). Blender coordinates are X width, Y length, Z up. The nose
points toward -Y, which the glTF exporter maps to the game's +Z approach face.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "wreck_sedan.blend"
GLB_PATH = ROOT / "src" / "assets" / "models" / "wreck-sedan.glb"


PALETTE = {
    "body": 0xB34A25,
    "body_dark": 0x54271F,
    "stripe": 0xF39B28,
    "rust": 0x7A3D24,
    "scorch": 0x211B1B,
    "glass": 0x537078,
    "glass_dark": 0x18272B,
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


def tube_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    color: str,
    vertices: int = 8,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    obj = cylinder(name, radius, direction.length, midpoint, color, vertices=vertices)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


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


def wheel(name: str, x: float, y: float, z: float, outer: float = 0.26, steer: float = 0.0) -> None:
    # `outer` is the tyre's outer radius, so the wheel tucks predictably into its arch.
    # A chrome hubcap with five dark slots reads cleaner than an open spoke rim.
    minor = outer * 0.30
    major = outer - minor
    width = 0.24
    rot = (0.0, math.pi / 2, steer)
    torus(f"{name}_Tyre", major, minor, (x, y, z), "rubber", rot)
    cylinder(f"{name}_Dish", major * 0.9, width, (x, y, z), "chrome", rot, 8)
    cylinder(f"{name}_Hub", major * 0.32, width + 0.03, (x, y, z), "steel", rot, 6)


def triangular_glass(name: str, side: int, intact: bool) -> None:
    x = side * 0.79
    verts = [
        (x, -0.72, 0.68),
        (x, 0.6, 0.68),
        (x, 0.42, 0.91),
        (x, -0.48, 0.91),
    ]
    if intact:
        faces = [(0, 1, 2, 3)]
        mesh = bpy.data.meshes.new(f"{name}_Mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, "glass", name)
        return

    # A broken pane is a few separated shards around a dark empty opening.
    for index, indices in enumerate(((0, 1, 3), (1, 2, 3))):
        shard_verts = [verts[i] for i in indices]
        if index == 1:
            shard_verts[0] = Vector(shard_verts[0]) + Vector((0.0, 0.08, -0.08))
        mesh = bpy.data.meshes.new(f"{name}_Shard_{index}_Mesh")
        mesh.from_pydata(shard_verts, [], [(0, 1, 2)])
        mesh.update()
        obj = bpy.data.objects.new(f"{name}_Shard_{index}", mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, "glass_dark", f"{name}_Shard_{index}")


def build() -> bpy.types.Object:
    # Clear the default scene. This script is intentionally a full asset rebuild.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # Lower body as a single side silhouette extruded across the width, with the two
    # wheel arches cut straight into it. This is the three-box read: long low hood,
    # a rocker between the arches, a short rear deck. Beltline sits at 0.56 m.
    body_profile = [
        (-1.95, 0.56),
        (-1.90, 0.15),
        (-1.68, 0.15),
        (-1.66, 0.30),
        (-1.52, 0.50),
        (-1.18, 0.50),
        (-1.04, 0.30),
        (-1.02, 0.15),
        (1.02, 0.15),
        (1.04, 0.30),
        (1.18, 0.50),
        (1.52, 0.50),
        (1.66, 0.30),
        (1.68, 0.15),
        (1.90, 0.15),
        (1.95, 0.56),
    ]
    extruded_profile("LowerBody", body_profile, 1.86, "body")

    # Crisp shut lines break the flat top into a hood and a trunk lid.
    box("HoodSeam", (1.5, 0.02, 0.012), (0.0, -0.62, 0.565), "body_dark")
    box("TrunkSeam", (1.5, 0.02, 0.012), (0.0, 0.66, 0.565), "body_dark")
    box("DoorSeamLeft", (0.02, 0.012, 0.4), (-0.94, 0.22, 0.36), "body_dark")
    box("DoorSeamRight", (0.02, 0.012, 0.4), (0.94, 0.22, 0.36), "body_dark")

    # A subtle raised trunk lip reads on the silhouette; finer trunk and hood
    # jewellery was cut to hold the instancing vertex budget.
    box("TrunkLip", (1.72, 0.07, 0.05), (0.0, 1.88, 0.585), "body")

    # Greenhouse as a solid extruded trapezoid: the raked windscreen and backlight
    # fall out of the front and rear slants, and the body left between the glass
    # panels reads as the A, B and C pillars. Roof holds under the 0.9 m clearance.
    cabin_profile = [
        (-0.55, 0.56),
        (-0.18, 0.90),
        (0.60, 0.90),
        (0.98, 0.56),
    ]
    extruded_profile("Cabin", cabin_profile, 1.42, "body")
    polygon("Windscreen", [
        (-0.58, -0.235, 0.86), (0.58, -0.235, 0.86), (0.6, -0.55, 0.585), (-0.6, -0.55, 0.585),
    ], "glass")
    polygon("Backlight", [
        (-0.56, 0.665, 0.86), (0.56, 0.665, 0.86), (0.58, 0.97, 0.585), (-0.58, 0.97, 0.585),
    ], "glass")
    for side in (-1, 1):
        x = side * 0.72
        polygon(f"SideGlassFront_{side}", [
            (x, -0.14, 0.83), (x, 0.15, 0.83), (x, 0.15, 0.6), (x, -0.40, 0.6),
        ], "glass")
        polygon(f"SideGlassRear_{side}", [
            (x, 0.25, 0.83), (x, 0.58, 0.83), (x, 0.78, 0.6), (x, 0.25, 0.6),
        ], "glass")

    # Brightwork: a chrome beltline molding down each flank, a bright surround under
    # the side glass, flush door handles and a dark vinyl roof. Period sedan cues
    # that read at a glance and separate the doors from the fenders.
    for side in (-1, 1):
        box(f"BeltMolding_{side}", (0.025, 3.4, 0.035), (side * 0.94, 0.0, 0.535), "chrome")
    box("VinylRoof", (1.44, 0.82, 0.025), (0.0, 0.21, 0.905), "vinyl")

    # Front face: a slim chrome bumper with a rubber strip and guards, a body-colour
    # valance below, a chrome-framed grille, recessed rectangular headlamps (driver
    # side cracked), outboard blinkers and a plate.
    box("FrontBumper", (1.86, 0.15, 0.12), (0.0, -1.98, 0.31), "chrome")
    box("FrontBumperStrip", (1.74, 0.05, 0.045), (0.0, -2.06, 0.31), "rubber")
    box("FrontValance", (1.72, 0.1, 0.12), (0.0, -1.95, 0.2), "body")
    box("GrilleSurround", (1.02, 0.05, 0.3), (0.0, -1.97, 0.46), "chrome")
    box("Grille", (0.92, 0.06, 0.24), (0.0, -1.99, 0.46), "scorch")
    for index, offset in enumerate((-0.3, -0.1, 0.1, 0.3)):
        box(f"GrilleBar_{index}", (0.05, 0.05, 0.22), (offset, -2.0, 0.46), "chrome")
    for side, lens in ((-1, "glass_dark"), (1, "glass")):
        x = side * 0.66
        box(f"HeadlampTrim_{side}", (0.42, 0.06, 0.22), (x, -1.95, 0.47), "chrome")
        box(f"HeadlampRecess_{side}", (0.36, 0.05, 0.18), (x, -1.98, 0.47), "scorch")
        box(f"HeadlampLens_{side}", (0.34, 0.05, 0.16), (x, -2.01, 0.47), lens)
    box("HeadlampCrack", (0.12, 0.05, 0.16), (-0.72, -2.03, 0.47), "scorch")
    for side in (-1, 1):
        box(f"Blinker_{side}", (0.14, 0.05, 0.1), (side * 0.9, -1.98, 0.44), "amber")
    box("FrontPlate", (0.5, 0.05, 0.15), (0.0, -2.07, 0.3), "chrome")

    # Rear face: a matching slim bumper with guards, wide red lamp clusters with
    # chrome trim and inboard reversing lights, a plate, and a bent chrome tailpipe.
    box("RearBumper", (1.86, 0.15, 0.12), (0.0, 2.0, 0.31), "chrome")
    box("RearBumperStrip", (1.74, 0.05, 0.045), (0.0, 2.08, 0.31), "rubber")
    for side in (-1, 1):
        x = side * 0.58
        box(f"TailTrim_{side}", (0.5, 0.06, 0.22), (x, 1.98, 0.48), "chrome")
        box(f"TailLamp_{side}", (0.44, 0.05, 0.17), (x, 2.01, 0.48), "lamp")
    box("RearPlate", (0.5, 0.05, 0.15), (0.0, 2.07, 0.33), "chrome")
    tube_between("ExhaustPipe", (-0.5, 1.86, 0.19), (-0.66, 2.12, 0.17), 0.05, "steel", 8)
    tube_between("ExhaustTip", (-0.64, 2.1, 0.17), (-0.74, 2.24, 0.16), 0.07, "chrome", 8)

    # Wing mirrors on both A-pillars, and a slim aerial on the rear quarter.
    for side in (-1, 1):
        box(f"MirrorArm_{side}", (0.14, 0.07, 0.05), (side * 0.72, -0.54, 0.62), "body")
        box(f"MirrorGlass_{side}", (0.04, 0.11, 0.13), (side * 0.82, -0.56, 0.63), "glass")
    cylinder("Aerial", 0.014, 0.32, (-0.6, 1.4, 0.72), "steel", (0.28, 0.1, 0.18), 6)

    # Four wheels sitting in the arches, tucked just inside the body sides.
    wheel("FrontLeft", -0.88, -1.35, 0.28)
    wheel("FrontRight", 0.88, -1.35, 0.28)
    wheel("RearLeft", -0.88, 1.35, 0.28)
    wheel("RearRight", 0.88, 1.35, 0.28)

    # Light, authored damage: a rust patch and a shadowed dent crease, nothing that
    # stops the eye reading a whole car first.
    box("QuarterRust", (0.02, 0.55, 0.18), (-0.94, 1.05, 0.4), "rust")
    box("DentCrease", (0.02, 0.44, 0.05), (0.94, -0.5, 0.42), "body_dark", (0.0, 0.0, 0.06))

    # Join every authored piece into one geometry. Material colors become a single
    # COLOR_0 attribute, so runtime can keep one shared vertex-color material.
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    wreck = bpy.context.object
    wreck.name = "WreckSedan"
    wreck.data.name = "WreckSedan_Mesh"
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
    wreck["game_dimensions_m"] = [2.1, 4.2, 0.9]
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
    wreck = bpy.data.objects.get("WreckSedan")
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
            space.region_3d.view_distance = 5.8
            space.region_3d.view_location = (0.0, 0.0, 0.55)


wreck = build()
save_and_export(wreck)
frame_viewport()
print(f"Built {wreck.name}: {len(wreck.data.vertices)} vertices, {len(wreck.data.polygons)} faces")
print(f"Saved {BLEND_PATH}")
print(f"Exported {GLB_PATH}")
