from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "3d" / "nana-cloud-crystal"
BLEND_OUT = ASSET_ROOT / "nana-cloud-crystal-app-models-refined-v09.blend"
PNG_OUT = ASSET_ROOT / "ui-baked" / "refined-v09"
GLB_OUT = ASSET_ROOT / "glb" / "refined-v09"
PREFIX = "nana_refined_icon_"

ICON_NAMES = [
    "wechat",
    "worldbook",
    "presets",
    "settings",
    "characters",
    "user",
    "theme",
    "sounds",
    "photos",
    "calls",
]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for data in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(data):
            if item.users == 0:
                data.remove(item)


def collection(name: str) -> bpy.types.Collection:
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def link_to(obj: bpy.types.Object, coll: bpy.types.Collection) -> bpy.types.Object:
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_material(
    name: str,
    color: tuple[float, float, float],
    roughness: float,
    alpha: float = 1.0,
    transmission: float = 0.0,
    emission: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, alpha)
    mat.blend_method = "BLEND"
    mat.use_screen_refraction = True
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        values = {
            "Base Color": (*color, alpha),
            "Alpha": alpha,
            "Roughness": roughness,
            "Metallic": 0.0,
            "Transmission Weight": transmission,
            "Transmission": transmission,
            "IOR": 1.46,
            "Coat Weight": 0.45,
            "Coat Roughness": 0.03,
        }
        for key, value in values.items():
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = value
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*color, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission
        if "Subsurface Weight" in bsdf.inputs and name.startswith("REF_cloud"):
            bsdf.inputs["Subsurface Weight"].default_value = 0.07
            if "Subsurface Radius" in bsdf.inputs:
                bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.72, 0.88)
    return mat


def sphere(
    name: str,
    location: Vector,
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    link_to(obj, coll)
    return obj


def cube(
    name: str,
    location: Vector,
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    bevel: float = 0.08,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("soft_bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    obj.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")
    link_to(obj, coll)
    return obj


def cylinder(
    name: str,
    location: Vector,
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("edge_softness", "BEVEL")
    bevel.width = min(radius * 0.32, 0.06)
    bevel.segments = 4
    obj.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")
    link_to(obj, coll)
    return obj


def torus(
    name: str,
    location: Vector,
    major: float,
    minor: float,
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=14, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    link_to(obj, coll)
    return obj


def curve(
    name: str,
    points: list[tuple[float, float, float]],
    bevel: float,
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    cyclic: bool = False,
) -> bpy.types.Object:
    data = bpy.data.curves.new(PREFIX + name + "_curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 18
    data.bevel_depth = bevel
    data.bevel_resolution = 4
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(PREFIX + name, data)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def local(center: Vector, x: float, y: float, z: float) -> Vector:
    return center + Vector((x, y, z))


def cloud_pedestal(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # A shared cloud and crystal saucer establishes material continuity across the launcher.
    sphere("crystal_saucer", local(center, 0, 0.08, -0.24), (1.56, 1.05, 0.20), mats["glass"], coll)
    torus("crystal_saucer_rim", local(center, 0, 0.06, -0.10), 1.18, 0.050, (1.28, 0.82, 1.0), mats["rim"], coll)
    torus("crystal_saucer_inner_rim", local(center, 0, 0.08, -0.06), 0.96, 0.030, (1.22, 0.76, 1.0), mats["blue"], coll)
    puffs = [
        (-0.86, 0.06, 0.18, 0.58, 0.40, 0.34),
        (-0.38, -0.17, 0.30, 0.70, 0.48, 0.45),
        (0.25, -0.13, 0.34, 0.76, 0.50, 0.50),
        (0.75, 0.08, 0.22, 0.59, 0.40, 0.36),
        (0.02, 0.24, 0.14, 1.12, 0.44, 0.31),
    ]
    for index, (x, y, z, sx, sy, sz) in enumerate(puffs):
        sphere(f"cloud_puff_{index}", local(center, x, y, z), (sx, sy, sz), mats["cloud"], coll)
    sphere("cloud_soft_center", local(center, 0.03, -0.06, 0.46), (0.63, 0.40, 0.42), mats["cloud_lit"], coll)


def add_wechat(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    cube("wechat_back_bubble", local(center, -0.26, 0.03, 0.92), (0.50, 0.16, 0.31), mats["lilac"], coll, 0.15, (0.06, 0.15, -0.16))
    cube("wechat_front_bubble", local(center, 0.30, -0.18, 1.02), (0.55, 0.16, 0.34), mats["pink"], coll, 0.16, (0.04, -0.12, 0.10))
    for x in (-0.46, -0.28, -0.10):
        sphere("wechat_back_dot", local(center, x, -0.14, 0.95), (0.035, 0.028, 0.035), mats["pearl"], coll)
    for x in (0.10, 0.30, 0.50):
        sphere("wechat_front_dot", local(center, x, -0.35, 1.06), (0.038, 0.028, 0.038), mats["pearl"], coll)
    cylinder("wechat_tail_back", local(center, -0.60, 0.03, 0.72), 0.08, 0.20, mats["lilac"], coll, (0, 0.5, 0.55))
    cylinder("wechat_tail_front", local(center, 0.70, -0.18, 0.78), 0.09, 0.22, mats["pink"], coll, (0, -0.45, -0.55))


def add_worldbook(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    cube("book_left_cover", local(center, -0.35, -0.05, 0.90), (0.45, 0.34, 0.075), mats["paper"], coll, 0.055, (0.04, 0.28, -0.18))
    cube("book_right_cover", local(center, 0.35, -0.05, 0.90), (0.45, 0.34, 0.075), mats["paper"], coll, 0.055, (0.04, -0.28, 0.18))
    cube("book_spine", local(center, 0, -0.05, 0.91), (0.08, 0.34, 0.10), mats["pink"], coll, 0.04)
    for index, y in enumerate((-0.18, -0.04, 0.10)):
        cube("book_page_line", local(center, -0.32, y, 0.99), (0.22, 0.012, 0.012), mats["lilac"], coll, 0.008, (0.04, 0.28, -0.18))
    curve("book_ribbon", [tuple(local(center, 0.12, 0.20, 1.00)), tuple(local(center, 0.22, 0.16, 0.70)), tuple(local(center, 0.33, 0.20, 0.62))], 0.036, mats["pink"], coll)
    sphere("book_ribbon_pearl", local(center, 0.34, 0.20, 0.60), (0.08, 0.06, 0.08), mats["pink"], coll)


def add_presets(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    cube("preset_console", local(center, 0, 0.02, 0.85), (0.74, 0.50, 0.11), mats["lilac"], coll, 0.10, (0.06, 0, 0))
    for index, x in enumerate((-0.36, 0.0, 0.36)):
        cube("preset_track", local(center, x, -0.06, 0.99), (0.055, 0.31, 0.026), mats["pearl"], coll, 0.028, (0.06, 0, 0))
        y = (-0.12, 0.08, -0.02)[index]
        sphere("preset_knob", local(center, x, y, 1.05), (0.12, 0.10, 0.07), mats["pink"], coll)
    sphere("preset_status_light", local(center, 0.55, 0.31, 1.02), (0.045, 0.035, 0.045), mats["blue"], coll)


def add_settings(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    torus("settings_gear_ring", local(center, 0, -0.02, 0.95), 0.36, 0.105, (1, 1, 1), mats["pink"], coll, (math.pi / 2, 0, 0))
    for index in range(10):
        angle = math.tau * index / 10
        x, z = math.cos(angle) * 0.52, math.sin(angle) * 0.52
        cube("settings_gear_tooth", local(center, x, -0.02, 0.95 + z), (0.10, 0.11, 0.10), mats["pink"], coll, 0.04, (0, angle, 0))
    cylinder("settings_center_glass", local(center, 0, -0.13, 0.95), 0.20, 0.10, mats["blue"], coll, (math.pi / 2, 0, 0))
    sphere("settings_center_pearl", local(center, 0, -0.20, 0.95), (0.09, 0.04, 0.09), mats["pearl"], coll)


def add_characters(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    sphere("character_head", local(center, -0.08, -0.10, 1.15), (0.27, 0.22, 0.29), mats["pearl"], coll)
    sphere("character_body", local(center, -0.08, 0.00, 0.75), (0.46, 0.28, 0.34), mats["lilac"], coll)
    sphere("character_companion", local(center, 0.52, -0.02, 0.84), (0.24, 0.17, 0.22), mats["pink"], coll)
    sphere("character_heart_left", local(center, 0.28, -0.18, 1.25), (0.10, 0.06, 0.11), mats["pink"], coll)
    sphere("character_heart_right", local(center, 0.43, -0.18, 1.25), (0.10, 0.06, 0.11), mats["pink"], coll)
    cube("character_heart_point", local(center, 0.355, -0.18, 1.14), (0.105, 0.06, 0.105), mats["pink"], coll, 0.035, (0, math.pi / 4, 0))


def add_user(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    cube("user_profile_card", local(center, -0.08, 0.04, 0.93), (0.64, 0.39, 0.10), mats["paper"], coll, 0.09, (0.05, -0.08, -0.10))
    sphere("user_profile_head", local(center, -0.32, -0.22, 1.06), (0.12, 0.05, 0.13), mats["lilac"], coll)
    sphere("user_profile_body", local(center, -0.32, -0.18, 0.87), (0.20, 0.07, 0.12), mats["lilac"], coll)
    for z in (1.08, 0.95, 0.82):
        cube("user_profile_line", local(center, 0.17, -0.20, z), (0.22, 0.025, 0.022), mats["pink"], coll, 0.02)
    cylinder("user_pen_body", local(center, 0.58, -0.12, 0.93), 0.055, 0.62, mats["pink"], coll, (0.0, 0.65, 0.52))
    sphere("user_pen_cap", local(center, 0.75, -0.12, 1.18), (0.08, 0.06, 0.08), mats["blue"], coll)


def add_theme(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    sphere("theme_palette", local(center, -0.08, -0.02, 0.90), (0.68, 0.42, 0.16), mats["pink"], coll)
    sphere("theme_thumb_hole", local(center, 0.30, -0.31, 0.98), (0.16, 0.05, 0.11), mats["lilac"], coll)
    for index, (x, y) in enumerate(((-0.35, -0.25), (-0.02, -0.32), (0.23, -0.13), (-0.24, 0.18))):
        sphere("theme_paint_bead", local(center, x, y, 1.05), (0.11, 0.07, 0.08), (mats["blue"], mats["pearl"], mats["lilac"], mats["pink"])[index], coll)
    cylinder("theme_brush_handle", local(center, 0.48, 0.02, 1.22), 0.045, 0.62, mats["pearl"], coll, (0.20, 0.62, -0.35))
    sphere("theme_brush_tip", local(center, 0.65, 0.02, 1.47), (0.075, 0.055, 0.10), mats["pink"], coll)


def add_sounds(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    curve("sounds_note_stem", [tuple(local(center, -0.05, -0.03, 0.72)), tuple(local(center, -0.05, -0.03, 1.48)), tuple(local(center, 0.55, -0.03, 1.62))], 0.070, mats["pink"], coll)
    sphere("sounds_note_head", local(center, -0.20, -0.09, 0.68), (0.20, 0.10, 0.14), mats["pink"], coll)
    sphere("sounds_note_head_two", local(center, 0.48, -0.08, 0.91), (0.17, 0.10, 0.13), mats["lilac"], coll)
    torus("sounds_wave_ring", local(center, 0.20, 0.13, 0.55), 0.54, 0.035, (1.2, 0.68, 1.0), mats["blue"], coll)


def add_photos(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    cube("photos_back_frame", local(center, -0.18, 0.10, 0.95), (0.59, 0.09, 0.50), mats["pink"], coll, 0.07, (0.12, -0.18, -0.16))
    cube("photos_back_sky", local(center, -0.18, -0.01, 0.98), (0.44, 0.025, 0.33), mats["blue"], coll, 0.025, (0.12, -0.18, -0.16))
    cube("photos_front_frame", local(center, 0.28, -0.12, 0.88), (0.60, 0.09, 0.51), mats["paper"], coll, 0.07, (0.08, 0.12, 0.13))
    cube("photos_front_sky", local(center, 0.28, -0.23, 0.90), (0.44, 0.025, 0.32), mats["lilac"], coll, 0.025, (0.08, 0.12, 0.13))
    sphere("photos_sun", local(center, 0.58, -0.29, 1.13), (0.07, 0.025, 0.07), mats["pink"], coll)
    curve("photos_mountain", [tuple(local(center, -0.03, -0.28, 0.72)), tuple(local(center, 0.22, -0.28, 0.93)), tuple(local(center, 0.49, -0.28, 0.74))], 0.030, mats["pearl"], coll)


def add_calls(center: Vector, coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    points = []
    for index in range(15):
        angle = math.radians(210 - index * 16)
        points.append(tuple(local(center, math.cos(angle) * 0.56, -0.07, 1.02 + math.sin(angle) * 0.56)))
    curve("calls_receiver", points, 0.115, mats["pink"], coll)
    sphere("calls_receiver_end_one", local(center, -0.49, -0.07, 0.74), (0.18, 0.13, 0.14), mats["pink"], coll)
    sphere("calls_receiver_end_two", local(center, 0.48, -0.07, 1.31), (0.18, 0.13, 0.14), mats["pink"], coll)
    sphere("calls_love_pearl_left", local(center, 0.08, -0.18, 1.22), (0.09, 0.05, 0.10), mats["pearl"], coll)
    sphere("calls_love_pearl_right", local(center, 0.21, -0.18, 1.22), (0.09, 0.05, 0.10), mats["pearl"], coll)


BUILDERS = {
    "wechat": add_wechat,
    "worldbook": add_worldbook,
    "presets": add_presets,
    "settings": add_settings,
    "characters": add_characters,
    "user": add_user,
    "theme": add_theme,
    "sounds": add_sounds,
    "photos": add_photos,
    "calls": add_calls,
}


def add_lighting(center: Vector, coll: bpy.types.Collection) -> None:
    specs = [
        ("key", (-3.3, -4.2, 6.4), 620, 4.8, (1.0, 0.86, 0.95)),
        ("blue", (3.0, -1.5, 3.2), 320, 3.2, (0.64, 0.84, 1.0)),
        ("pink", (-2.8, 1.5, 2.6), 260, 2.8, (1.0, 0.55, 0.78)),
    ]
    for name, position, energy, size, color in specs:
        data = bpy.data.lights.new(PREFIX + name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(PREFIX + name, data)
        coll.objects.link(obj)
        obj.location = local(center, *position)
        look_at(obj, local(center, 0, 0, 0.55))


def setup_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.18
    if scene.world:
        scene.world.use_nodes = True
        background = next((node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND"), None)
        if background:
            background.inputs["Color"].default_value = (0.55, 0.72, 1.0, 1)
            background.inputs["Strength"].default_value = 0.38
    cam_data = bpy.data.cameras.new(PREFIX + "camera_data")
    cam = bpy.data.objects.new(PREFIX + "camera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 4.05
    scene.camera = cam
    return cam


def render_icon(camera: bpy.types.Object, center: Vector, name: str) -> None:
    camera.location = local(center, 0, -6.6, 4.65)
    look_at(camera, local(center, 0, 0, 0.62))
    bpy.context.scene.render.filepath = str(PNG_OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def export_collection(coll: bpy.types.Collection, name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    exportables = [obj for obj in coll.objects if obj.type in {"MESH", "CURVE"}]
    for obj in exportables:
        obj.select_set(True)
    if exportables:
        bpy.context.view_layer.objects.active = exportables[0]
        bpy.ops.export_scene.gltf(
            filepath=str(GLB_OUT / f"{name}.glb"),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_materials="EXPORT",
        )


def build() -> None:
    clear_scene()
    PNG_OUT.mkdir(parents=True, exist_ok=True)
    GLB_OUT.mkdir(parents=True, exist_ok=True)
    mats = {
        "cloud": make_material("REF_cloud_soft_microfiber", (1.0, 0.94, 0.99), 0.42, 1.0, 0.0, 0.015),
        "cloud_lit": make_material("REF_cloud_lit_pearl", (1.0, 0.98, 1.0), 0.30, 1.0, 0.0, 0.035),
        "glass": make_material("REF_crystal_saucer_pink_blue", (0.70, 0.83, 1.0), 0.06, 0.48, 0.58, 0.050),
        "rim": make_material("REF_crystal_rim_blush", (1.0, 0.64, 0.84), 0.025, 0.72, 0.10, 0.075),
        "pink": make_material("REF_pink_ceramic", (1.0, 0.36, 0.61), 0.22, 1.0, 0.0, 0.045),
        "lilac": make_material("REF_lilac_ceramic", (0.78, 0.70, 1.0), 0.20, 1.0, 0.0, 0.030),
        "blue": make_material("REF_ice_blue_crystal", (0.45, 0.76, 1.0), 0.12, 0.76, 0.22, 0.060),
        "paper": make_material("REF_soft_pearl_paper", (1.0, 0.84, 0.92), 0.34, 1.0, 0.0, 0.018),
        "pearl": make_material("REF_pearl_highlight", (1.0, 0.96, 1.0), 0.16, 1.0, 0.0, 0.040),
    }
    camera = setup_scene()
    created: list[tuple[str, bpy.types.Collection, Vector]] = []
    for index, name in enumerate(ICON_NAMES):
        center = Vector((index * 8.0, 0, 0))
        coll = collection(f"APP_{index + 1:02d}_{name.upper()}_REFINED")
        cloud_pedestal(center, coll, mats)
        BUILDERS[name](center, coll, mats)
        add_lighting(center, coll)
        created.append((name, coll, center))

    readme = bpy.data.texts.new("README_REFINED_APP_MODELS")
    readme.write(
        "Nana refined cloud app models v09\n\n"
        "Each launcher App is a separately named collection with a shared cloud and crystal pedestal.\n"
        "Edit the object in each collection, then run this script to re-bake the matching transparent PNG.\n"
        "The app currently uses the baked icons; GLBs are editable reference exports.\n"
    )
    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 720
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    for name, coll, center in created:
        render_icon(camera, center, name)
        export_collection(coll, name)
    print(f"Refined Nana app model library written: {BLEND_OUT}")


if __name__ == "__main__":
    build()
