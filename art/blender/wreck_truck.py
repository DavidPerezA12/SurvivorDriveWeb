"""Build the Blender-authored low-poly wreck pickup truck used by the road hazard.

Run from Blender's scripting workspace or from the command line:

    blender --background --python art/blender/wreck_truck.py

The script writes the editable .blend beside itself and exports the runtime GLB
to src/assets/models (run `npm run models:optimize` afterwards to quantize it). Blender coordinates are X width, Y length, Z up. The nose
points toward -Y, which the glTF exporter maps to the game's +Z approach face.

Companion to wreck_sedan.py and wreck_van.py: same pipeline, vertex-colour bake
and export settings, so the three share one instanced vertex-colour material at
runtime. A forward cab and an open, cargo-strewn flatbed read the pickup apart
from the sedan and van at the spawn horizon; the olive work-truck palette keeps
the recognition in shape + colour (docs/DESIGN.md -> readability).
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "wreck_truck.blend"
GLB_PATH = ROOT / "src" / "assets" / "models" / "wreck-truck.glb"


# Shares the warm wreck signature palette (src/render/palette.ts -> wreck*) with the
# sedan and van: every abandoned car reads as one interactive class (warm,
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
    "grille": 0x16171B,
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

    # Chassis sill running the full length.
    box("Sill", (1.78, 4.7, 0.3), (0.0, 0.05, 0.16), "body_dark")

    # Forward cab (faces the player at -Y): body, crushed roof, raked windscreen,
    # with the passenger flank smashed in. Kept low so it holds under the 0.9 m
    # wreck clearance like the sedan and van.
    box("Cab", (1.7, 1.3, 0.56), (0.0, -0.95, 0.55), "body")
    box("CabRoof", (1.5, 1.1, 0.06), (0.0, -0.86, 0.82), "cabin")
    polygon("Windscreen", [
        (-0.75, -1.5, 0.79), (0.75, -1.5, 0.79), (0.77, -1.72, 0.55), (-0.77, -1.72, 0.55),
    ], "glass")
    box("SideGlass", (0.1, 1.0, 0.32), (-0.73, -0.95, 0.72), "glass")
    box("SmashedSide", (0.12, 0.5, 0.28), (0.73, -0.9, 0.72), "scorch")

    # Sloped hood, chrome-framed dark grille, slim bumper and dead headlamps.
    tapered_box("Hood", (1.7, 0.96), (1.58, 0.7), 0.2, (0.0, -1.94, 0.52), "body", top_shift=(0.0, -0.14))
    box("Grille", (1.2, 0.06, 0.24), (0.0, -2.36, 0.5), "grille")
    box("FrontBumper", (1.86, 0.22, 0.2), (0.0, -2.46, 0.32), "chrome")
    for side, lens in ((-1, "glass"), (1, "scorch")):
        box(f"Headlamp_{side}", (0.3, 0.06, 0.14), (side * 0.6, -2.4, 0.5), lens)

    # A signature stripe wraps the cab so the colour reads at the horizon.
    for side in (-1, 1):
        box(f"Stripe_{side}", (0.03, 1.3, 0.14), (side * 0.86, -0.95, 0.6), "stripe")

    # Open flatbed behind the cab: floor, two side walls, a bulkhead against the cab,
    # and the tailgate hung open off the back.
    box("BedFloor", (1.74, 2.1, 0.14), (0.0, 1.25, 0.5), "body_dark")
    for side in (-1, 1):
        box(f"BedWall_{side}", (0.14, 2.1, 0.36), (side * 0.8, 1.25, 0.66), "body")
    box("Bulkhead", (1.6, 0.14, 0.36), (0.0, 0.28, 0.66), "body")
    box("Tailgate", (1.6, 0.12, 0.34), (0.0, 2.2, 0.42), "rust", (-0.6, 0.0, 0.0))

    # The load it died carrying: a lashed crate, a tarp roll across the bed, and a
    # jerry can wedged in a corner.
    box("Crate", (0.55, 0.55, 0.4), (-0.3, 0.95, 0.72), "rust", (0.0, 0.0, 0.4))
    cylinder("TarpRoll", 0.16, 1.2, (0.15, 1.6, 0.66), "vinyl", (0.0, math.pi / 2, 0.0), 8)
    box("JerryCan", (0.24, 0.16, 0.3), (0.55, 0.78, 0.72), "body_dark", (0.0, 0.9, 0.0))

    # Spare wheel slung under the bed and a tow hitch off the rear frame.
    wheel("Spare", 0.35, 1.85, 0.24, outer=0.22)
    box("TowHitch", (0.1, 0.22, 0.12), (0.0, 2.32, 0.38), "steel")

    # Exhaust run under the sill with a scorched tip.
    cylinder("Exhaust", 0.05, 1.4, (-0.55, 1.25, 0.2), "scorch", (math.pi / 2, 0.0, 0.0), 8)
    box("ExhaustTip", (0.1, 0.2, 0.1), (-0.55, 2.0, 0.2), "scorch")

    # Door mirrors and a snapped whip antenna on the cab.
    for side in (-1, 1):
        box(f"MirrorArm_{side}", (0.14, 0.08, 0.05), (side * 0.9, -1.4, 0.68), "body")
        box(f"MirrorGlass_{side}", (0.04, 0.1, 0.12), (side * 0.98, -1.44, 0.69), "glass")
    cylinder("Aerial", 0.014, 0.24, (0.72, -1.55, 0.72), "steel", (0.4, 0.0, -0.36), 6)

    # Fender arches over the front wheels.
    for side in (-1, 1):
        box(f"ArchFront_{side}", (0.16, 1.02, 0.34), (side * 0.9, -1.4, 0.36), "body_dark")

    # Rust eating the flanks and a scorch smeared across the hood.
    box("RustFlank", (0.03, 0.9, 0.4), (0.9, -0.5, 0.55), "rust")
    box("ScorchHood", (0.5, 0.5, 0.03), (0.3, -1.0, 0.83), "scorch")

    # Wheels tucked into the arches; the rear-right is blown flat (a crushed dark
    # stub) so the wreck reads as beached, not parked.
    wheel("FrontLeft", -0.85, -1.4, 0.3)
    wheel("FrontRight", 0.85, -1.4, 0.3)
    wheel("RearLeft", -0.85, 1.45, 0.3)
    box("FlatRearRight", (0.62, 0.66, 0.24), (0.85, 1.45, 0.16), "body_dark")

    # Join every authored piece into one geometry. Material colors become a single
    # COLOR_0 attribute, so runtime can keep one shared vertex-color material.
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    wreck = bpy.context.object
    wreck.name = "WreckTruck"
    wreck.data.name = "WreckTruck_Mesh"
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
    wreck["game_dimensions_m"] = [1.9, 5.0, 0.9]
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
    wreck = bpy.data.objects.get("WreckTruck")
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
            space.region_3d.view_distance = 6.6
            space.region_3d.view_location = (0.0, 0.0, 0.55)


wreck = build()
save_and_export(wreck)
frame_viewport()
print(f"Built {wreck.name}: {len(wreck.data.vertices)} vertices, {len(wreck.data.polygons)} faces")
print(f"Saved {BLEND_PATH}")
print(f"Exported {GLB_PATH}")
