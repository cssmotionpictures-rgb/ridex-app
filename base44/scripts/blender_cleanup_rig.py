# =============================================================================
# THE FORGOTTEN ONES — Blender cleanup + export stage
# Run this on YOUR OWN machine/server (Base44 cannot run Blender or GPU work).
#
# This script performs the parts that are reliably automatable on a raw
# TRELLIS / image-to-3D GLB:
#   - import the generated GLB
#   - apply transforms, recalc normals, decimate, normalize scale to ~1.8m
#   - validate humanoid topology heuristically (warn, do not fake)
#   - export a single clean GLB (mesh + PBR materials, skins/animations preserved
#     IF the incoming file already had them)
#
# It does NOT auto-rig. Auto-rigging an arbitrary generated mesh with correct
# skin weights is NOT something a script can do reliably on every topology
# (extra limbs / fused fingers break it). Use ONE of these real rig routes
# OUTSIDE this script:
#
#   MANUAL (free, reliable):  upload the cleaned mesh to https://www.mixamo.com
#                             -> Auto-Rigger -> place markers -> Rig -> download FBX
#                             -> re-import here / into Blender, attach combat anims, export GLB.
#
#   AUTOMATED (self-hosted):  run Rigify / GameRig in headless Blender on your GPU
#                             server behind an HTTP endpoint, then point Base44's
#                             auto-rig-character function at it via RIG_SERVER_URL.
#                             Rigify is scriptable (bpy.ops.armature.rigify_generate)
#                             but requires a matched metarig — not a one-liner.
#
# Usage:  blender -b -P blender_cleanup_rig.py -- <input.glb> <output.glb>
# =============================================================================
import bpy
import sys
import os

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []
INPUT = argv[0] if len(argv) > 0 else "/PATH/Babatunde_TRELLIS.glb"
OUTPUT = argv[1] if len(argv) > 1 else "/PATH/Babatunde_CLEAN.glb"
TARGET_HEIGHT = 1.8
DECIMATE_RATIO = 0.5  # keep 50% of triangles; lower for mobile

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT)

# ---- Clean meshes ----
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for obj in meshes:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Decimate
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = DECIMATE_RATIO
    bpy.ops.object.modifier_apply(modifier="Decimate")
    obj.select_set(False)

# ---- Normalize scale to ~1.8m height ----
if meshes:
    min_z = min(o.bound_box[0][2] for o in meshes)
    max_z = max(o.bound_box[6][2] for o in meshes)
    height = max_z - min_z
    if height > 0:
        scale = TARGET_HEIGHT / height
        for obj in meshes:
            obj.scale *= scale
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.select_set(False)

# ---- Heuristic humanoid validation (WARN only — never fake a rig) ----
bones = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
skinned = any(
    any(m.object_type == "MESH" and any(vg for vg in m.vertex_groups) for m in obj.children)
    for obj in bones
)
if not bones:
    print("VALIDATION: NO ARMATURE — status=MODEL_CLEAN (not rigged). Run Mixamo/Rigify next.")
elif not skinned:
    print("VALIDATION: ARMATURE PRESENT BUT NOT SKINNED — status=RIGGED (needs skin weights).")
else:
    print("VALIDATION: SKINNED RIG PRESENT — status=SKINNED/ANIMATED (verify combat anims).")

# ---- Export clean GLB ----
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format="GLB",
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_animations=True,
    export_skins=True,
)
print("CLEAN GLB CREATED:", OUTPUT)