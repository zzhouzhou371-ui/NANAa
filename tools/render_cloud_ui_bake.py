import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def args_after_double_dash():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def descendants(obj):
    out = []
    stack = list(obj.children)
    while stack:
        child = stack.pop()
        out.append(child)
        stack.extend(list(child.children))
    return out


def set_origin_safe(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def materialize_visibility(target_objects):
    original = {}
    targets = set(target_objects)
    for obj in bpy.data.objects:
        original[obj.name] = (obj.hide_get(), obj.hide_viewport, obj.hide_render)
        visible = obj in targets
        obj.hide_set(not visible)
        obj.hide_viewport = not visible
        obj.hide_render = not visible
    return original


def restore_visibility(original):
    for name, state in original.items():
        obj = bpy.data.objects.get(name)
        if obj:
            hidden, hide_viewport, hide_render = state
            obj.hide_set(hidden)
            obj.hide_viewport = hide_viewport
            obj.hide_render = hide_render


def object_bounds(objects):
    bpy.context.view_layer.update()
    coords = []
    for obj in objects:
        if obj.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        for corner in obj.bound_box:
            coords.append(obj.matrix_world @ Vector(corner))

    if not coords:
        raise RuntimeError("No renderable bounds found for selected asset")

    min_v = Vector((min(v.x for v in coords), min(v.y for v in coords), min(v.z for v in coords)))
    max_v = Vector((max(v.x for v in coords), max(v.y for v in coords), max(v.z for v in coords)))
    return min_v, max_v


def new_area_light(name, location, energy, size, target):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def set_engine(scene):
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            return scene.render.engine
        except TypeError:
            continue
        except Exception:
            continue
    scene.render.engine = "BLENDER_WORKBENCH"
    return scene.render.engine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--camera")
    parser.add_argument("--light-prefix")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--samples", type=int, default=96)
    parser.add_argument("--exposure", type=float)
    ns = parser.parse_args(args_after_double_dash())

    root = bpy.data.objects.get(ns.asset)
    if root is None:
        raise RuntimeError(f"Asset root not found: {ns.asset}")

    scene = bpy.context.scene
    objects = [root] + descendants(root)
    camera = bpy.data.objects.get(ns.camera) if ns.camera else None
    scene_lights = []
    if ns.light_prefix:
        scene_lights = [
            obj for obj in bpy.data.objects
            if obj.type == "LIGHT" and obj.name.startswith(ns.light_prefix)
        ]
    render_objects = objects + ([camera] if camera else []) + scene_lights

    original_visibility = materialize_visibility(render_objects)
    original_camera = scene.camera
    original_render = {
        "engine": scene.render.engine,
        "resolution_x": scene.render.resolution_x,
        "resolution_y": scene.render.resolution_y,
        "film_transparent": scene.render.film_transparent,
        "filepath": scene.render.filepath,
        "view_transform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "gamma": scene.view_settings.gamma,
    }
    created = []

    try:
        min_v, max_v = object_bounds(objects)
        center = (min_v + max_v) * 0.5
        size = max_v - min_v
        max_dim = max(size.x, size.y, size.z, 1.0)

        if camera:
            scene.camera = camera
        else:
            cam_data = bpy.data.cameras.new("nana_ui_bake_camera_data")
            cam = bpy.data.objects.new("nana_ui_bake_camera", cam_data)
            bpy.context.collection.objects.link(cam)
            created.append(cam)
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = max(size.x * 1.18, size.z * 1.85, max_dim * 1.28)
            cam.location = Vector((center.x, center.y - max_dim * 2.7, center.z + max_dim * 1.05))
            look_at(cam, center + Vector((0, 0, max_dim * 0.06)))
            scene.camera = cam

        if not scene_lights:
            created.append(new_area_light("nana_ui_bake_key", center + Vector((-max_dim * 1.1, -max_dim * 2.2, max_dim * 2.4)), 250, max_dim * 2.4, center))
            created.append(new_area_light("nana_ui_bake_fill", center + Vector((max_dim * 1.9, -max_dim * 1.0, max_dim * 1.1)), 80, max_dim * 3.0, center))
            created.append(new_area_light("nana_ui_bake_soft_top", center + Vector((0, max_dim * 0.4, max_dim * 2.7)), 60, max_dim * 4.0, center))

        engine = set_engine(scene)
        if hasattr(scene, "eevee"):
            if hasattr(scene.eevee, "taa_render_samples"):
                scene.eevee.taa_render_samples = ns.samples
            if hasattr(scene.eevee, "taa_samples"):
                scene.eevee.taa_samples = min(ns.samples, 64)

        scene.render.resolution_x = ns.width
        scene.render.resolution_y = ns.height
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.view_settings.view_transform = original_render["view_transform"]
        scene.view_settings.look = original_render["look"]
        scene.view_settings.exposure = ns.exposure if ns.exposure is not None else original_render["exposure"]
        scene.view_settings.gamma = original_render["gamma"]

        os.makedirs(os.path.dirname(ns.out), exist_ok=True)
        scene.render.filepath = ns.out
        bpy.ops.render.render(write_still=True)

        print(json.dumps({"ok": True, "asset": ns.asset, "out": ns.out, "engine": engine}, ensure_ascii=False))
    finally:
        restore_visibility(original_visibility)
        scene.camera = original_camera
        scene.render.engine = original_render["engine"]
        scene.render.resolution_x = original_render["resolution_x"]
        scene.render.resolution_y = original_render["resolution_y"]
        scene.render.film_transparent = original_render["film_transparent"]
        scene.render.filepath = original_render["filepath"]
        scene.view_settings.view_transform = original_render["view_transform"]
        scene.view_settings.look = original_render["look"]
        scene.view_settings.exposure = original_render["exposure"]
        scene.view_settings.gamma = original_render["gamma"]
        for obj in created:
            bpy.data.objects.remove(obj, do_unlink=True)


if __name__ == "__main__":
    main()
