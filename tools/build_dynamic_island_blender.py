from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "3d" / "nana-cloud-crystal"
BLEND_OUT = ASSET_ROOT / "dynamic_island_pink_glass_capsule_01.blend"
GLB_OUT = ASSET_ROOT / "glb" / "dynamic_island_pink_glass_capsule_01.glb"
PNG_OUT = ASSET_ROOT / "ui-baked" / "dynamic-island-pink-glass.png"
PREVIEW_OUT = ASSET_ROOT / "dynamic_island_pink_glass_capsule_01_preview.png"

PREFIX = "nana_dynamic_island_"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablock_collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.lights,
        bpy.data.cameras,
    ):
        for item in list(datablock_collection):
            if item.users == 0:
                datablock_collection.remove(item)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def pill_points(length: float, width: float, count: int, inset: float = 0.0) -> list[tuple[float, float]]:
    length = max(length - inset * 2, 0.1)
    width = max(width - inset * 2, 0.1)
    radius = width / 2
    center_x = length / 2 - radius
    half = count // 2
    points: list[tuple[float, float]] = []
    for i in range(half):
        angle = -math.pi / 2 + math.pi * i / (half - 1)
        points.append((center_x + math.cos(angle) * radius, math.sin(angle) * radius))
    for i in range(half):
        angle = math.pi / 2 + math.pi * i / (half - 1)
        points.append((-center_x + math.cos(angle) * radius, math.sin(angle) * radius))
    return points


def material(
    name: str,
    base: tuple[float, float, float],
    alpha: float,
    roughness: float,
    transmission: float,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*base, alpha)
    mat.blend_method = "BLEND"
    mat.use_screen_refraction = True
    mat.show_transparent_back = True
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass

    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        values = {
            "Base Color": (*base, alpha),
            "Alpha": alpha,
            "Roughness": roughness,
            "Metallic": 0.0,
            "Transmission Weight": transmission,
            "Transmission": transmission,
            "IOR": 1.46,
            "Coat Weight": 0.72,
            "Coat Roughness": 0.025,
            "Specular IOR Level": 0.92,
        }
        for key, value in values.items():
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = value
        if emission:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission, 1)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def make_capsule_body(mat: bpy.types.Material) -> bpy.types.Object:
    length = 5.18
    width = 1.16
    height = 0.34
    rings = 15
    points = 160
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []

    for ring in range(rings):
        v = ring / (rings - 1)
        z = (v - 0.5) * height
        lens = math.sin(v * math.pi)
        inset = 0.16 * (1 - lens) + 0.012 * abs(v - 0.5)
        for x, y in pill_points(length, width, points, inset):
            vertices.append((x, y, z))

    for ring in range(rings - 1):
        a = ring * points
        b = (ring + 1) * points
        for i in range(points):
            j = (i + 1) % points
            faces.append((a + i, a + j, b + j))
            faces.append((a + i, b + j, b + i))

    bottom = len(vertices)
    vertices.append((0, 0, -height / 2))
    top = len(vertices)
    vertices.append((0, 0, height / 2))
    top_base = (rings - 1) * points
    for i in range(points):
        j = (i + 1) % points
        faces.append((bottom, j, i))
        faces.append((top, top_base + i, top_base + j))

    mesh = bpy.data.meshes.new(PREFIX + "capsule_body_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(PREFIX + "capsule_body", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    bevel = obj.modifiers.new("real thick-glass micro bevel", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 6
    obj.modifiers.new("weighted glass normals", "WEIGHTED_NORMAL")
    obj.select_set(False)
    return obj


def make_curve_pill(
    name: str,
    mat: bpy.types.Material,
    length: float,
    width: float,
    z: float,
    inset: float,
    bevel_depth: float,
) -> bpy.types.Object:
    points = pill_points(length, width, 160, inset)
    curve = bpy.data.curves.new(PREFIX + name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 24
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 6
    spline = curve.splines.new("POLY")
    spline.points.add(len(points))
    for point, (x, y) in zip(spline.points, points + [points[0]]):
        point.co = (x, y, z, 1)
    obj = bpy.data.objects.new(PREFIX + name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def make_wave(
    name: str,
    mat: bpy.types.Material,
    x0: float,
    x1: float,
    y: float,
    z: float,
    amp: float,
    bevel_depth: float,
    phase: float,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(PREFIX + name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 32
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 4
    count = 96
    spline = curve.splines.new("POLY")
    spline.points.add(count - 1)
    for i, point in enumerate(spline.points):
        t = i / (count - 1)
        taper = math.sin(t * math.pi)
        x = x0 + (x1 - x0) * t
        yy = y + math.sin(t * math.pi * 4.15 + phase) * amp * (0.18 + taper * 0.82)
        point.co = (x, yy, z, 1)
    obj = bpy.data.objects.new(PREFIX + name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def make_glint(name: str, mat: bpy.types.Material, location: tuple[float, float, float], radius: float) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=12, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.name = PREFIX + name + "_mesh"
    obj.scale.z = 0.08
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def add_lighting() -> None:
    def area(name: str, loc: tuple[float, float, float], energy: float, size: float) -> None:
        data = bpy.data.lights.new(PREFIX + name, "AREA")
        obj = bpy.data.objects.new(PREFIX + name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        data.energy = energy
        data.size = size
        look_at(obj, Vector((0, 0, 0.05)))

    area("large_sky_softbox", (-1.7, -2.35, 3.15), 620, 4.8)
    area("pink_low_reflector", (2.15, -1.25, 1.05), 190, 3.0)
    area("blue_rim_reflector", (-2.65, 0.55, 1.35), 160, 2.4)
    area("pinpoint_glint", (1.82, -1.6, 3.15), 300, 0.24)


def add_camera() -> None:
    cam_data = bpy.data.cameras.new(PREFIX + "camera_data")
    cam = bpy.data.objects.new(PREFIX + "camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.58
    cam.location = (0, -1.22, 4.8)
    look_at(cam, Vector((0, 0, 0.05)))
    bpy.context.scene.camera = cam


def set_render_settings(width: int, height: int) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 96
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 12
        scene.cycles.transparent_max_bounces = 12
        scene.cycles.caustics_reflective = True
        scene.cycles.caustics_refractive = True
    except Exception:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = "Filmic"
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    if scene.world:
        scene.world.color = (0.86, 0.93, 1.0)
        scene.world.use_nodes = True
        background = next((node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND"), None)
        if background:
            background.inputs["Color"].default_value = (0.86, 0.93, 1.0, 1)
            background.inputs["Strength"].default_value = 0.9


def add_preview_backplate(mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.025, -0.30))
    obj = bpy.context.object
    obj.name = PREFIX + "preview_mist_backplate"
    obj.scale = (4.1, 1.55, 0.018)
    obj.data.materials.append(mat)
    return obj


def build() -> None:
    clear_scene()
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
    PNG_OUT.parent.mkdir(parents=True, exist_ok=True)

    glass = material(PREFIX + "clear_blush_glass", (1.0, 0.88, 0.972), 0.26, 0.007, 0.90, (1.0, 0.90, 0.985), 0.075)
    rim = material(PREFIX + "pearl_rim", (1.0, 0.955, 0.995), 0.88, 0.012, 0.30, (1.0, 0.88, 0.980), 0.13)
    blue = material(PREFIX + "blue_edge_refraction", (0.54, 0.82, 1.0), 0.55, 0.026, 0.18, (0.36, 0.68, 1.0), 0.105)
    pink = material(PREFIX + "pink_caustics", (1.0, 0.40, 0.74), 0.60, 0.055, 0.06, (1.0, 0.30, 0.66), 0.145)
    white = material(PREFIX + "white_glints", (1.0, 1.0, 1.0), 0.96, 0.010, 0.06, (1.0, 1.0, 1.0), 0.26)
    mist = material(PREFIX + "preview_mist", (0.86, 0.93, 1.0), 1.0, 0.7, 0.0)

    exportables = [
        make_capsule_body(glass),
        make_curve_pill("outer_pearl_rim", rim, 5.22, 1.21, 0.186, 0.016, 0.023),
        make_curve_pill("middle_blue_refractive_rim", blue, 5.08, 1.08, 0.205, 0.012, 0.013),
        make_curve_pill("inner_blue_rim", blue, 4.95, 0.965, 0.214, 0.004, 0.011),
        make_curve_pill("inner_blush_refraction", pink, 4.70, 0.790, 0.221, 0.018, 0.008),
        make_wave("top_real_glass_glint", white, -1.88, 1.58, -0.337, 0.228, 0.012, 0.017, 0.2),
        make_wave("lower_pink_caustic_ripple", pink, -2.10, 2.05, 0.265, 0.220, 0.028, 0.013, 1.1),
        make_wave("blue_caustic_ripple", blue, -2.18, 2.02, 0.186, 0.218, 0.017, 0.009, 2.0),
        make_wave("right_pink_refractive_streak", pink, 0.82, 2.18, 0.215, 0.230, 0.011, 0.017, 0.5),
        make_glint("star_glint_1", white, (1.96, -0.19, 0.246), 0.024),
        make_glint("star_glint_2", white, (2.18, -0.28, 0.249), 0.014),
        make_glint("star_glint_3", white, (-1.56, 0.20, 0.240), 0.018),
        make_glint("star_glint_4", white, (2.54, 0.04, 0.241), 0.012),
    ]
    backplate = add_preview_backplate(mist)
    add_lighting()
    add_camera()
    set_render_settings(1400, 420)
    for obj in exportables:
        try:
            obj.visible_shadow = False
        except Exception:
            pass

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))

    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in exportables:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = exportables[0]
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )

    backplate.hide_render = True
    bpy.context.scene.render.filepath = str(PNG_OUT)
    bpy.ops.render.render(write_still=True)
    backplate.hide_render = True
    bpy.context.scene.render.film_transparent = False
    if bpy.context.scene.world:
        bpy.context.scene.world.color = (0.86, 0.93, 1.0)
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 720
    bpy.context.scene.camera.data.ortho_scale = 6.3
    bpy.context.scene.render.filepath = str(PREVIEW_OUT)
    bpy.ops.render.render(write_still=True)

    print(f"Nana Blender dynamic island written: {BLEND_OUT} {GLB_OUT} {PNG_OUT} {PREVIEW_OUT}")


if __name__ == "__main__":
    build()
