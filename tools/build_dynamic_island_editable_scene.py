from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "3d" / "nana-cloud-crystal"
BLEND_OUT = ASSET_ROOT / "dynamic_island_pink_glass_triple_gradient_v07.blend"
GLB_OUT = ASSET_ROOT / "glb" / "dynamic_island_pink_glass_triple_gradient_v07.glb"
PNG_OUT = ASSET_ROOT / "ui-baked" / "dynamic-island-pink-glass-triple-gradient-v07.png"
PREVIEW_OUT = ASSET_ROOT / "dynamic_island_pink_glass_triple_gradient_v07_preview.png"

PREFIX = "nana_edit_dynamic_island_"


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


def collection(name: str) -> bpy.types.Collection:
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def link_to(obj: bpy.types.Object, coll: bpy.types.Collection) -> bpy.types.Object:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


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
            "Specular IOR Level": 0.94,
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


def vertical_gradient_material(
    name: str,
    color_stops: list[tuple[float, tuple[float, float, float]]],
    alpha: float,
    roughness: float,
    transmission: float,
    emission_strength: float,
) -> bpy.types.Material:
    mat = material(name, color_stops[-1][1], alpha, roughness, transmission, color_stops[-1][1], emission_strength)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return mat

    coords = nodes.new("ShaderNodeTexCoord")
    coords.name = name + "_generated_coords"
    split = nodes.new("ShaderNodeSeparateXYZ")
    split.name = name + "_vertical_gradient_axis"
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = name + "_three_stop_gradient"
    coords.location = (-560, 70)
    split.location = (-360, 70)
    ramp.location = (-150, 70)

    elements = ramp.color_ramp.elements
    elements[0].position = color_stops[0][0]
    elements[0].color = (*color_stops[0][1], 1)
    elements[-1].position = color_stops[-1][0]
    elements[-1].color = (*color_stops[-1][1], 1)
    for position, color in color_stops[1:-1]:
        element = elements.new(position)
        element.color = (*color, 1)

    links.new(coords.outputs["Generated"], split.inputs["Vector"])
    links.new(split.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    return mat


def make_capsule_body(mat: bpy.types.Material, coll: bpy.types.Collection, name: str) -> bpy.types.Object:
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

    mesh = bpy.data.meshes.new(PREFIX + "01_GlassBody_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(PREFIX + name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    bevel = obj.modifiers.new("EDIT glass body bevel width", "BEVEL")
    bevel.width = 0.014
    bevel.segments = 7
    obj.modifiers.new("EDIT weighted glass normals", "WEIGHTED_NORMAL")
    obj["edit_hint"] = "Adjust this mesh bevel modifier for the capsule softness. Curves control line thickness."
    obj.select_set(False)
    return obj


def make_curve_pill(
    name: str,
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    length: float,
    width: float,
    z: float,
    inset: float,
    bevel_depth: float,
) -> bpy.types.Object:
    points = pill_points(length, width, 160, inset)
    curve = bpy.data.curves.new(PREFIX + name + "_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 24
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 5
    spline = curve.splines.new("POLY")
    spline.points.add(len(points))
    for point, (x, y) in zip(spline.points, points + [points[0]]):
        point.co = (x, y, z, 1)

    obj = bpy.data.objects.new(PREFIX + name, curve)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    obj["edit_hint"] = "Line thickness is Object Data > Geometry > Bevel Depth."
    obj["current_bevel_depth"] = bevel_depth
    return obj


def make_wave(
    name: str,
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    x0: float,
    x1: float,
    y: float,
    z: float,
    amp: float,
    bevel_depth: float,
    phase: float,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(PREFIX + name + "_curve", "CURVE")
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
        yy = y + math.sin(t * math.pi * 3.2 + phase) * amp * (0.16 + taper * 0.84)
        point.co = (x, yy, z, 1)

    obj = bpy.data.objects.new(PREFIX + name, curve)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    obj["edit_hint"] = "This is intentionally thin. Raise bevel_depth only a little if needed."
    obj["current_bevel_depth"] = bevel_depth
    return obj


def make_glint(
    name: str,
    mat: bpy.types.Material,
    coll: bpy.types.Collection,
    location: tuple[float, float, float],
    radius: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=10, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.name = PREFIX + name + "_mesh"
    obj.scale.z = 0.06
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    link_to(obj, coll)
    obj["edit_hint"] = "Tiny glint. Scale this object if the sparkle feels too loud."
    return obj


def add_lighting(coll: bpy.types.Collection) -> None:
    def area(name: str, loc: tuple[float, float, float], energy: float, size: float) -> None:
        data = bpy.data.lights.new(PREFIX + name, "AREA")
        obj = bpy.data.objects.new(PREFIX + name, data)
        coll.objects.link(obj)
        obj.location = loc
        data.energy = energy
        data.size = size
        look_at(obj, Vector((0, 0, 0.05)))

    area("large_sky_softbox", (-1.7, -2.35, 3.15), 540, 5.2)
    area("soft_pink_reflector", (2.05, -1.25, 1.1), 118, 3.4)
    area("soft_blue_rim_reflector", (-2.65, 0.60, 1.4), 96, 2.8)
    area("tiny_edge_glint", (1.9, -1.7, 3.05), 150, 0.22)


def add_camera(coll: bpy.types.Collection) -> None:
    cam_data = bpy.data.cameras.new(PREFIX + "camera_data")
    cam = bpy.data.objects.new(PREFIX + "camera_preview_ortho", cam_data)
    coll.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.78
    cam.location = (0, -1.22, 4.8)
    look_at(cam, Vector((0, 0, 0.05)))
    bpy.context.scene.camera = cam


def set_opening_view(camera: bpy.types.Object, active_object: bpy.types.Object) -> None:
    """Store a useful viewport state so opening the .blend never looks empty."""
    for workspace in bpy.data.workspaces:
        for screen in workspace.screens:
            for area in screen.areas:
                if area.type != "VIEW_3D":
                    continue
                space = area.spaces.active
                try:
                    space.camera = camera
                    space.region_3d.view_perspective = "CAMERA"
                    space.shading.type = "MATERIAL"
                except Exception:
                    pass
    bpy.ops.object.select_all(action="DESELECT")
    active_object.select_set(True)
    bpy.context.view_layer.objects.active = active_object


def set_render_settings(width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
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


def add_preview_backplate(mat: bpy.types.Material, coll: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.025, -0.30))
    obj = bpy.context.object
    obj.name = PREFIX + "preview_mist_backplate_hide_for_transparent_png"
    obj.scale = (4.1, 1.55, 0.018)
    obj.data.materials.append(mat)
    link_to(obj, coll)
    return obj


def add_readme_text() -> None:
    text = bpy.data.texts.new("README_EDIT_DYNAMIC_ISLAND")
    text.write(
        "Editable Nana dynamic island triple blush gradient v07\n"
        "\n"
        "Do not adjust line thickness by scaling the whole object first.\n"
        "Select a curve in collection 04_SPARSE_REFRACTION_ACCENTS and change:\n"
        "Object Data Properties > Geometry > Bevel Depth.\n"
        "\n"
        "Suggested ranges:\n"
        "- outer pearl rim: 0.0045 to 0.008\n"
        "- refraction highlights: 0.001 to 0.002\n"
        "- short refraction highlights: 0.001 to 0.002\n"
        "\n"
        "The rose gradient core has a subtle 48-frame breathing animation.\n"
        "Materials are named clearly. Lower material alpha or emission if a highlight feels loud.\n"
        "This file is a scratch/editable scene and does not replace the app asset unless you export it manually.\n"
    )


def add_core_breath(core: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 48
    base = core.scale.copy()
    for frame, factor in ((1, 1.0), (24, 1.028), (48, 1.0)):
        core.scale = (base.x * factor, base.y * factor, base.z * factor)
        core.keyframe_insert(data_path="scale", frame=frame)
    if core.animation_data and core.animation_data.action:
        core.animation_data.action.name = "EDIT_core_soft_breath_2_seconds"
    core.scale = base
    scene.frame_set(1)


def build() -> None:
    clear_scene()
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
    PNG_OUT.parent.mkdir(parents=True, exist_ok=True)

    body_coll = collection("01_OUTER_BLUSH_GLASS")
    mid_coll = collection("02_MID_BLUSH_GRADIENT")
    core_coll = collection("03_ROSE_GRADIENT_CORE")
    line_coll = collection("04_SPARSE_REFRACTION_ACCENTS")
    glint_coll = collection("05_SINGLE_GLINT")
    setup_coll = collection("06_CAMERA_LIGHTS_PREVIEW")

    glass = vertical_gradient_material(
        "EDIT_outer_blush_crystal_three_stop",
        [(0.0, (0.95, 0.36, 0.62)), (0.52, (1.0, 0.62, 0.79)), (1.0, (1.0, 0.82, 0.91))],
        0.34,
        0.11,
        0.52,
        0.028,
    )
    middle = vertical_gradient_material(
        "EDIT_mid_blush_crystal_three_stop",
        [(0.0, (0.96, 0.31, 0.57)), (0.50, (1.0, 0.50, 0.70)), (1.0, (1.0, 0.74, 0.86))],
        0.30,
        0.16,
        0.30,
        0.032,
    )
    core = vertical_gradient_material(
        "EDIT_rose_jelly_core_three_stop",
        [(0.0, (0.93, 0.23, 0.49)), (0.50, (1.0, 0.42, 0.64)), (1.0, (1.0, 0.66, 0.80))],
        0.52,
        0.20,
        0.14,
        0.050,
    )
    outer = material("EDIT_fine_pearl_outer_edge", (1.0, 0.92, 0.98), 0.72, 0.024, 0.04, (1.0, 0.76, 0.91), 0.055)
    blue = material("EDIT_ice_blue_side_refraction", (0.40, 0.80, 1.0), 0.48, 0.020, 0.08, (0.18, 0.72, 1.0), 0.060)
    white = material("EDIT_short_pearl_highlight", (1.0, 0.98, 1.0), 0.76, 0.014, 0.01, (1.0, 0.91, 0.98), 0.065)
    mist = material("EDIT_preview_mist_backplate", (0.86, 0.93, 1.0), 1.0, 0.7, 0.0)

    shell = make_capsule_body(glass, body_coll, "01A_outer_blush_glass")
    mid_layer = make_capsule_body(middle, mid_coll, "02A_mid_blush_gradient")
    mid_layer.scale = (0.94, 0.78, 0.70)
    mid_layer.location.z = 0.028
    rose_core = make_capsule_body(core, core_coll, "03A_rose_jelly_gradient_core")
    rose_core.scale = (0.82, 0.56, 0.50)
    rose_core.location.z = 0.055
    add_core_breath(rose_core)

    exportables = [
        shell,
        mid_layer,
        rose_core,
        make_curve_pill("04A_outer_pearl_rim_HAIRLINE_bevel_0_005", outer, line_coll, 5.22, 1.21, 0.188, 0.014, 0.005),
        make_wave("04B_left_ice_blue_refraction_HAIRLINE_bevel_0_0012", blue, line_coll, -2.08, -1.30, 0.18, 0.235, 0.008, 0.0012, 1.6),
        make_wave("04C_right_pearl_highlight_HAIRLINE_bevel_0_0014", white, line_coll, 1.30, 1.92, -0.362, 0.240, 0.005, 0.0014, 0.3),
        make_glint("05A_one_right_edge_glint", white, glint_coll, (1.94, -0.28, 0.252), 0.010),
    ]

    backplate = add_preview_backplate(mist, setup_coll)
    add_lighting(setup_coll)
    add_camera(setup_coll)
    add_readme_text()
    set_render_settings(1800, 420)

    for obj in exportables:
        try:
            obj.visible_shadow = False
        except Exception:
            pass

    set_opening_view(bpy.context.scene.camera, rose_core)
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
    bpy.context.scene.camera.data.ortho_scale = 6.3
    bpy.context.scene.render.filepath = str(PNG_OUT)
    bpy.ops.render.render(write_still=True)

    backplate.hide_render = True
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 720
    bpy.context.scene.camera.data.ortho_scale = 6.3
    bpy.context.scene.render.filepath = str(PREVIEW_OUT)
    bpy.ops.render.render(write_still=True)

    print(f"Nana editable dynamic island scene written: {BLEND_OUT} {GLB_OUT} {PNG_OUT} {PREVIEW_OUT}")


if __name__ == "__main__":
    build()
