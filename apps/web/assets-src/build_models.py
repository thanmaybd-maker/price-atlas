"""Builds the Price Atlas 3D assets in Blender and exports them as glTF binaries.

flower.glb  - original carbon-fibre mechanical flower. Static assembly plus two petal
              templates (PetalOuter, PetalInner) whose origin is the hinge; petals lie flat
              along +X so the web app can clone, place and hinge them per lookup step.
wave.glb    - one finite breaking wave: a curling crest swept along X that tapers to a
              point at both ends. Vertex colour R marks foam (the lip), G marks height.

Blender is Z-up; the glTF exporter converts to Y-up (Blender -Y becomes three +Z).
Run: python3 build_models.py <outdir>
"""
import math
import os
import sys

import bpy  # noqa: E402  (bpy must load before bmesh)
import bmesh
from mathutils import Vector

OUT = sys.argv[-1] if len(sys.argv) > 1 else '.'
HERE = os.path.dirname(os.path.abspath(__file__))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metal=0.0, rough=0.4, tex=None, clearcoat=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if clearcoat:
        p.inputs['Coat Weight'].default_value = clearcoat
        p.inputs['Coat Roughness'].default_value = 0.08
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = 1.0
    if tex:
        img = bpy.data.images.load(tex)
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    return m


def finish(obj, m=None, smooth=True, bevel=0.0, segs=2):
    if m:
        obj.data.materials.append(m)
    if bevel:
        b = obj.modifiers.new('bev', 'BEVEL')
        b.width = bevel
        b.segments = segs
        b.limit_method = 'ANGLE'
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        w = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
        w.keep_sharp = True
    return obj


def cyl(name, r, depth, z, m, verts=48, r2=None, bevel=0.0):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(0, 0, z))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    return finish(o, m, bevel=bevel)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def bez(p0, p1, p2, p3, n):
    out = []
    for i in range(n):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append(tuple(a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k] for k in range(2)))
    return out


def petal_outline(length, n=36):
    # leaf shape along +X: hinge at origin, tip at length
    s = length
    a = bez((0, 0), (0.22 * s, 0.42 * s * 0.6), (0.63 * s, 0.5 * s * 0.6), (s, 0), n)
    b = bez((s, 0), (0.63 * s, -0.5 * s * 0.6), (0.22 * s, -0.42 * s * 0.6), (0, 0), n)
    return a + b


CUP = {'len': 1.0}


def cup(x, y):
    # spoon the petal: edges curl up, the blade arches gently from hinge to tip
    L = CUP['len']
    return 0.55 * (y / L) ** 2 * L + 0.07 * L * math.sin(math.pi * min(1.0, max(0.0, x / L)))


def slab(name, pts, z0, z1, m):
    """Extrudes a closed 2D outline between z0 and z1, following the petal's cupped surface."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0 + cup(x, y))) for x, y in pts]
    top = [bm.verts.new((x, y, z1 + cup(x, y))) for x, y in pts]
    n = len(pts)
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def inset(pts, k, cx):
    # shrink outline toward its centre line, keeping the hinge end
    return [(cx + (x - cx) * k, y * k) for x, y in pts]


def petal_width(t):
    # rounded petal: narrow claw at the hinge, broad shoulder past the middle, soft round tip
    if t <= 0 or t >= 1:
        return 0.0
    body = math.sin(math.pi * t ** 0.78) ** 0.55
    claw = 0.35 + 0.65 * min(1.0, t / 0.22)
    return 0.31 * body * claw


def petal_solid(name, L, wk, z0, thick, m, shade=None, rows=40, cols=12):
    """Lofted petal blade that follows the cupped surface, with optional base-to-tip shading."""
    CUP['len'] = L
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lay = bm.loops.layers.color.new('Col') if shade else None
    top, bot = [], []
    for i in range(rows + 1):
        t = i / rows
        x = L * (0.02 + 0.98 * t)
        w = petal_width(t) * L * wk
        rt, rb = [], []
        for j in range(-cols, cols + 1):
            y = w * j / cols
            # a soft centre crease runs down the blade like a real petal
            crease = -0.012 * L * math.exp(-((y / (0.05 * L + 1e-6)) ** 2)) * math.sin(math.pi * t)
            z = cup(x, y) + crease
            rt.append(bm.verts.new((x, y, z0 + thick + z)))
            rb.append(bm.verts.new((x, y, z0 + z)))
        top.append(rt)
        bot.append(rb)

    def color(f, t):
        if lay:
            c = shade(t)
            for lp in f.loops:
                lp[lay] = (c, c, c, 1.0)

    for i in range(rows):
        t = (i + 0.5) / rows
        for j in range(2 * cols):
            f = bm.faces.new((top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]))
            color(f, t)
            g = bm.faces.new((bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]))
            color(g, t)
        # side walls
        for side in (0, 2 * cols):
            f = bm.faces.new((top[i][side], top[i + 1][side], bot[i + 1][side], bot[i][side]))
            color(f, t)
    for i in (0, rows):
        for j in range(2 * cols):
            f = bm.faces.new((top[i][j], bot[i][j], bot[i][j + 1], top[i][j + 1]))
            color(f, i / rows)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def build_petal(name, length, M, panel='panel', rim='alu'):
    # thin brushed-metal rim under a glossy tinted blade; the blade deepens toward the hinge
    frame = petal_solid(name + '_rim', length, 1.0, -0.004, 0.012, M[rim])
    blade = petal_solid(name + '_blade', length, 0.93, 0.006, 0.014, M[panel],
                        shade=lambda t: 0.62 + 0.38 * min(1.0, t * 1.35))
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.032, depth=0.12,
                                        location=(0.02, 0, 0.004), rotation=(math.pi / 2, 0, 0))
    knuckle = finish(bpy.context.object, M['alu'], bevel=0.006)
    return join([frame, blade, knuckle], name)


def cube_uv(o, size=0.18):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=size)
    bpy.ops.object.mode_set(mode='OBJECT')


def flower():
    reset()
    M = {
        'carbon': mat('Carbon', (0.05, 0.05, 0.06), 0.1, 0.32, tex=os.path.join(HERE, 'carbon.png'), clearcoat=1.0),
        'alu': mat('Aluminium', (0.86, 0.87, 0.89), 1.0, 0.24),
        'steel': mat('DarkSteel', (0.42, 0.45, 0.5), 1.0, 0.34),
        'panel': mat('Panel', (0.27, 0.45, 0.78), 0.0, 0.3, clearcoat=1.0),
        'core': mat('Core', (0.2, 0.75, 0.45), 0.0, 0.3, emit=(0.2, 0.75, 0.45)),
        # sap green, a little blue in it so it reads as plant, not plastic
        'stem': mat('Stem', (0.07, 0.3, 0.1), 0.0, 0.42, clearcoat=0.5),
        'leaf': mat('Leaf', (0.12, 0.45, 0.16), 0.0, 0.35, clearcoat=0.8),
    }
    # stem: a slim green rod with two small brushed joint rings, ending in a point
    stem = cyl('stem', 0.034, 2.05, -0.28, M['stem'], verts=20)
    parts = [stem, cyl('tip', 0.0, 0.14, -1.37, M['stem'], verts=20, r2=0.034)]
    for z in (-0.85, -0.2):
        parts.append(cyl('joint', 0.05, 0.035, z, M['alu'], verts=20, bevel=0.006))
    # two leaves on the joints, same build as petals but leaf green
    for s_, z in ((1, -0.85), (-1, -0.2)):
        leaf = build_petal('leaf', 0.62, M, panel='leaf', rim='stem')
        leaf.location = (s_ * 0.03, 0, z)
        leaf.rotation_euler = (0, -0.6, 0 if s_ > 0 else math.pi)
        bpy.ops.object.select_all(action='DESELECT')
        leaf.select_set(True)
        bpy.context.view_layer.objects.active = leaf
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(leaf)
    stem = join(parts, 'Stem')
    # hub: chamfered aluminium drum with a carbon cap
    hub = join([
        cyl('hubdrum', 0.56, 0.24, 0.78, M['alu'], verts=64, bevel=0.03),
        cyl('hubcap', 0.44, 0.06, 0.92, M['carbon'], verts=64, bevel=0.01),
        cyl('hubneck', 0.16, 0.2, 0.6, M['steel'], verts=32, r2=0.3),
    ], 'Hub')
    # gear ring: 30 teeth, spins against the flower
    ring = cyl('ring', 0.76, 0.09, 0, M['steel'], verts=90, bevel=0.01)
    hole = cyl('hole', 0.66, 0.4, 0, None, verts=90)
    b = ring.modifiers.new('cut', 'BOOLEAN')
    b.object = hole
    b.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = ring
    bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(hole)
    teeth = [ring]
    for j in range(30):
        a = j / 30 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * 0.81, math.sin(a) * 0.81, 0),
                                        rotation=(0, 0, a))
        t = bpy.context.object
        t.scale = (0.1, 0.07, 0.085)
        bpy.ops.object.transform_apply(scale=True)
        teeth.append(finish(t, M['steel'], smooth=False, bevel=0.008, segs=1))
    gear = join(teeth, 'Gear')
    gear.location = (0, 0, 0.78)
    # stamens: aluminium pins with ball tips around the core
    st = []
    for i in range(10):
        a = i / 10 * math.tau
        r = 0.27
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.012, depth=0.22,
                                            location=(math.cos(a) * r, math.sin(a) * r, 1.02),
                                            rotation=(-math.sin(a) * 0.35, math.cos(a) * 0.35, 0))
        st.append(finish(bpy.context.object, M['alu']))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.03,
                                             location=(math.cos(a) * (r + 0.04), math.sin(a) * (r + 0.04), 1.12))
        st.append(finish(bpy.context.object, M['alu']))
    join(st, 'Stamens')
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.16, location=(0, 0, 1.0))
    finish(bpy.context.object, M['core']).name = 'Core'
    # petal templates at the origin, hidden by scale in the app until cloned
    build_petal('PetalOuter', 1.75, M)
    build_petal('PetalInner', 1.3, M)
    # carbon weave needs real UVs: box-project the carbon-bearing parts at a fine scale
    for n in ('Hub',):
        cube_uv(bpy.data.objects[n], 0.16)
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'flower.glb'), export_format='GLB',
                              export_yup=True, export_apply=True, export_image_format='JPEG',
                              export_vertex_color='ACTIVE',
                              export_jpeg_quality=82)


def wave():
    reset()
    m = mat('Wave', (0.17, 0.38, 0.66), 0.0, 0.5)
    # closed cross-section (y forward is -Y, toward the shore), crest curls over the face
    prof = [(1.6, -0.12), (1.6, 0.0), (1.0, 0.12), (0.5, 0.3), (0.15, 0.5), (-0.1, 0.66),
            (-0.38, 0.64), (-0.6, 0.5), (-0.62, 0.36), (-0.5, 0.33), (-0.42, 0.42), (-0.3, 0.4),
            (-0.22, 0.28), (-0.24, 0.14), (-0.36, 0.04), (-0.7, -0.02), (-0.7, -0.12)]
    foam_idx = {6, 7, 8}
    me = bpy.data.meshes.new('Wave')
    bm = bmesh.new()
    col = bm.loops.layers.color.new('Col')
    STEPS = 64
    L = 8.0
    rings = []
    for i in range(STEPS + 1):
        u = i / STEPS
        x = (u - 0.5) * L
        # taper to a point at both ends; ends also lean back so they trail the crest
        tp = math.sin(math.pi * u) ** 0.7
        lean = (1 - tp) * 0.6
        ring = []
        for k, (y, z) in enumerate(prof):
            ring.append(bm.verts.new((x, y * (0.45 + 0.55 * tp) + lean, z * tp)))
        rings.append(ring)
    for i in range(STEPS):
        a, b = rings[i], rings[i + 1]
        n = len(prof)
        for k in range(n - 1):
            f = bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
            for loop in f.loops:
                kk = a.index(loop.vert) if loop.vert in a else b.index(loop.vert)
                foam = 1.0 if kk in foam_idx else 0.0
                h = max(0.0, prof[kk][1]) / 0.66
                loop[col] = (foam, h, 0.0, 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    # make the foam/height layer the one the exporter writes as COLOR_0
    me.color_attributes.active_color_name = 'Col'
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    o = bpy.data.objects.new('Wave', me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    sub = o.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'wave.glb'), export_format='GLB',
                              export_yup=True, export_apply=True, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_materials='EXPORT')


if __name__ == '__main__':
    flower()
    wave()
    print('BUILT', os.listdir(OUT))
