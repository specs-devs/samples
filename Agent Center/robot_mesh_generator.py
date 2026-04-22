import bpy
import bmesh
import os
import math
import mathutils

OUTPUT_FILENAME = "Robot_Meshes.glb"

THEME_NAMES = ["Cat", "Owl", "Ghost", "Axolotl", "CRT", "Robot"]

WIFI_YS = [0.65, 0.75, 0.55, 0.60, 0.70, 0.95]
WAVE_XS = [0.55, 0.40, 0.38, 0.55, 0.48, 0.65]
WAVE_YS = [0.25, 0.20, 0.15, 0.32, 0.20, 0.0]
WAVE_ROTS = [0.20, 0.00, 0.10, 0.30, 0.00, 0.0]
WAVE_SPREADS = [0.15, 0.15, 0.15, 0.15, 0.15, 0.25]

CORNER_SEGS = 10
SPHERE_SEGS = 24
ARC_SEGS = 20

# Fixed UV scale matching the face shader's coordinate system.
# 0.65 covers the largest body half-extent across all themes with margin.
FACE_UV_HALF = 0.65


# ---------------------------------------------------------------------------
# Utility: link object to scene
# ---------------------------------------------------------------------------
def link_obj(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_empty(name: str) -> bpy.types.Object:
    emp = bpy.data.objects.new(name, None)
    emp.empty_display_size = 0.1
    return link_obj(emp)


def set_parent(child: bpy.types.Object, parent: bpy.types.Object) -> None:
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# ---------------------------------------------------------------------------
# Utility: planar front-projection UVs for face texture mapping
# ---------------------------------------------------------------------------
def project_front_uvs(obj: bpy.types.Object) -> None:
    """Add planar +Z projection UVs using a fixed world-space scale.

    Maps local-space XY to UV [0,1] via:  u = x / (2 * FACE_UV_HALF) + 0.5
    so (0,0) in world -> (0.5, 0.5) in UV.  The face shader reconstructs
    world coords with: coord = (uv - 0.5) * 2 * FACE_UV_HALF.
    """
    mesh_data = obj.data
    if not mesh_data.uv_layers:
        mesh_data.uv_layers.new(name="FaceUV")
    uv_layer = mesh_data.uv_layers.active

    scale = 2.0 * FACE_UV_HALF
    for poly in mesh_data.polygons:
        for loop_idx in poly.loop_indices:
            vert = mesh_data.vertices[mesh_data.loops[loop_idx].vertex_index]
            u = vert.co.x / scale + 0.5
            v = vert.co.y / scale + 0.5
            uv_layer.data[loop_idx].uv = (u, v)


# ---------------------------------------------------------------------------
# Utility: create a rounded box mesh (maps to sdRoundBox)
# ---------------------------------------------------------------------------
def create_rounded_box(
    name: str,
    half_extents: tuple[float, float, float],
    radius: float,
    segments: int = CORNER_SEGS,
) -> bpy.types.Object:
    hx, hy, hz = half_extents
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co.x *= (hx + radius)
        v.co.y *= (hy + radius)
        v.co.z *= (hz + radius)

    bevel_geom = bm.edges[:] + bm.verts[:]
    bmesh.ops.bevel(
        bm, geom=bevel_geom, offset=radius,
        segments=segments, affect='EDGES', profile=0.5,
        offset_type='OFFSET',
    )

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for f in mesh.polygons:
        f.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a UV sphere
# ---------------------------------------------------------------------------
def create_sphere(
    name: str, radius: float, location: tuple[float, float, float] = (0, 0, 0),
    segments: int = SPHERE_SEGS, rings: int = 0,
) -> bpy.types.Object:
    if rings == 0:
        rings = max(segments // 2, 4)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for f in mesh.polygons:
        f.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a 3D arc mesh (maps to sdArc)
# ---------------------------------------------------------------------------
def create_arc_mesh(
    name: str,
    arc_radius: float,
    thickness: float,
    half_angle: float,
    depth: float = 0.015,
    segments: int = ARC_SEGS,
) -> bpy.types.Object:
    bm = bmesh.new()
    inner_r = arc_radius - thickness
    outer_r = arc_radius + thickness

    front_inner: list[bmesh.types.BMVert] = []
    front_outer: list[bmesh.types.BMVert] = []
    back_inner: list[bmesh.types.BMVert] = []
    back_outer: list[bmesh.types.BMVert] = []

    for i in range(segments + 1):
        t = i / segments
        a = -half_angle + t * 2 * half_angle
        ci, si = math.sin(a), math.cos(a)
        front_inner.append(bm.verts.new((ci * inner_r, si * inner_r, depth)))
        front_outer.append(bm.verts.new((ci * outer_r, si * outer_r, depth)))
        back_inner.append(bm.verts.new((ci * inner_r, si * inner_r, -depth)))
        back_outer.append(bm.verts.new((ci * outer_r, si * outer_r, -depth)))

    for i in range(segments):
        j = i + 1
        try:
            bm.faces.new((front_inner[i], front_outer[i], front_outer[j], front_inner[j]))
        except ValueError:
            pass
        try:
            bm.faces.new((back_inner[j], back_outer[j], back_outer[i], back_inner[i]))
        except ValueError:
            pass
        try:
            bm.faces.new((front_outer[i], back_outer[i], back_outer[j], front_outer[j]))
        except ValueError:
            pass
        try:
            bm.faces.new((front_inner[j], back_inner[j], back_inner[i], front_inner[i]))
        except ValueError:
            pass

    try:
        bm.faces.new((front_inner[0], back_inner[0], back_outer[0], front_outer[0]))
    except ValueError:
        pass
    try:
        bm.faces.new((front_outer[-1], back_outer[-1], back_inner[-1], front_inner[-1]))
    except ValueError:
        pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a tube-swept arc with hemispherical end caps (matches sdArc)
# ---------------------------------------------------------------------------
def create_tube_arc(
    name: str,
    arc_radius: float,
    tube_radius: float,
    half_angle: float,
    arc_segments: int = ARC_SEGS,
    tube_segments: int = 12,
    cap_segments: int = 4,
) -> bpy.types.Object:
    """Arc with circular tube cross-section and hemispherical end caps.

    Matches the SDF shader's sdArc: length(p - closest_arc_point) - thickness,
    which naturally rounds both the cross-section and the endpoints.
    """
    bm = bmesh.new()
    all_rings: list[list[bmesh.types.BMVert]] = []

    def _arc_frame(a: float) -> tuple[
        tuple[float, float], tuple[float, float], tuple[float, float]
    ]:
        cx, cy = math.sin(a) * arc_radius, math.cos(a) * arc_radius
        nx, ny = math.sin(a), math.cos(a)
        tx, ty = math.cos(a), -math.sin(a)
        return (cx, cy), (nx, ny), (tx, ty)

    def _add_ring(
        center: tuple[float, float],
        normal: tuple[float, float],
        radius: float,
    ) -> None:
        ring: list[bmesh.types.BMVert] = []
        nx, ny = normal
        if radius < 0.0005:
            v = bm.verts.new((center[0], center[1], 0.0))
            ring = [v] * tube_segments
        else:
            for j in range(tube_segments):
                theta = 2.0 * math.pi * j / tube_segments
                ring.append(bm.verts.new((
                    center[0] + nx * math.cos(theta) * radius,
                    center[1] + ny * math.cos(theta) * radius,
                    math.sin(theta) * radius,
                )))
        all_rings.append(ring)

    (cx, cy), (nx, ny), (tx, ty) = _arc_frame(-half_angle)
    for ci in range(cap_segments, 0, -1):
        phi = ci / cap_segments * (math.pi / 2.0)
        cap_r = tube_radius * math.cos(phi)
        cap_off = tube_radius * math.sin(phi)
        _add_ring(
            (cx - tx * cap_off, cy - ty * cap_off),
            (nx, ny),
            cap_r,
        )

    for i in range(arc_segments + 1):
        t = i / arc_segments
        a = -half_angle + t * 2.0 * half_angle
        (cx, cy), (nx, ny), _ = _arc_frame(a)
        _add_ring((cx, cy), (nx, ny), tube_radius)

    (cx, cy), (nx, ny), (tx, ty) = _arc_frame(half_angle)
    for ci in range(1, cap_segments + 1):
        phi = ci / cap_segments * (math.pi / 2.0)
        cap_r = tube_radius * math.cos(phi)
        cap_off = tube_radius * math.sin(phi)
        _add_ring(
            (cx + tx * cap_off, cy + ty * cap_off),
            (nx, ny),
            cap_r,
        )

    for i in range(len(all_rings) - 1):
        ra, rb = all_rings[i], all_rings[i + 1]
        a_degen = tube_segments > 1 and ra[0] is ra[1]
        b_degen = tube_segments > 1 and rb[0] is rb[1]
        for j in range(tube_segments):
            nj = (j + 1) % tube_segments
            if a_degen and b_degen:
                continue
            if a_degen:
                try:
                    bm.faces.new((ra[0], rb[nj], rb[j]))
                except ValueError:
                    pass
            elif b_degen:
                try:
                    bm.faces.new((ra[j], ra[nj], rb[0]))
                except ValueError:
                    pass
            else:
                try:
                    bm.faces.new((ra[j], ra[nj], rb[nj], rb[j]))
                except ValueError:
                    pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a torus ring (maps to sdFlatRing)
# ---------------------------------------------------------------------------
def create_torus_ring(
    name: str,
    major_radius: float,
    minor_radius: float,
    major_segments: int = 48,
    minor_segments: int = 12,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, segments=1, radius1=1, radius2=1, depth=0)
    bm.clear()

    grid: list[list[bmesh.types.BMVert]] = []
    for i in range(major_segments):
        phi = 2 * math.pi * i / major_segments
        ring_verts: list[bmesh.types.BMVert] = []
        for j in range(minor_segments):
            theta = 2 * math.pi * j / minor_segments
            x = (major_radius + minor_radius * math.cos(theta)) * math.cos(phi)
            z = (major_radius + minor_radius * math.cos(theta)) * math.sin(phi)
            y = minor_radius * math.sin(theta)
            ring_verts.append(bm.verts.new((x, y, z)))
        grid.append(ring_verts)

    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            try:
                bm.faces.new((grid[i][j], grid[ni][j], grid[ni][nj], grid[i][nj]))
            except ValueError:
                pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a partial torus ring with flat end caps
# ---------------------------------------------------------------------------
def create_partial_torus_ring(
    name: str,
    major_radius: float,
    minor_radius: float,
    start_angle: float,
    end_angle: float,
    major_segments: int = 24,
    minor_segments: int = 12,
) -> bpy.types.Object:
    """Partial torus ring in XY plane (Z depth) spanning start_angle to end_angle.

    Matches the SDF shader's question mark hook: abs(length(hc) - R) - thickness,
    clipped by min(-hc.x, -hc.y) to remove one quadrant.
    """
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    angle_span = end_angle - start_angle

    for i in range(major_segments + 1):
        phi = start_angle + angle_span * i / major_segments
        cx = major_radius * math.cos(phi)
        cy = major_radius * math.sin(phi)
        nx = math.cos(phi)
        ny = math.sin(phi)

        ring: list[bmesh.types.BMVert] = []
        for j in range(minor_segments):
            theta = 2.0 * math.pi * j / minor_segments
            ring.append(bm.verts.new((
                cx + nx * math.cos(theta) * minor_radius,
                cy + ny * math.cos(theta) * minor_radius,
                math.sin(theta) * minor_radius,
            )))
        rings.append(ring)

    for i in range(major_segments):
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            try:
                bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][nj], rings[i][nj]))
            except ValueError:
                pass

    for end_idx in (0, -1):
        ring = rings[end_idx]
        phi = start_angle if end_idx == 0 else end_angle
        cx = major_radius * math.cos(phi)
        cy = major_radius * math.sin(phi)
        center = bm.verts.new((cx, cy, 0.0))
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            try:
                if end_idx == 0:
                    bm.faces.new((center, ring[nj], ring[j]))
                else:
                    bm.faces.new((center, ring[j], ring[nj]))
            except ValueError:
                pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a Z-letter mesh (maps to sdZ)
# ---------------------------------------------------------------------------
def create_z_mesh(
    name: str,
    size: float,
    tube_radius: float = 0.01,
    radial_segments: int = 10,
    length_segments: int = 6,
    cap_segments: int = 4,
) -> bpy.types.Object:
    """Z-letter built from tube-swept line segments with spherical joints.

    Matches the SDF sdZ: distance-from-segments minus radius, giving
    perfectly round tube cross-sections and smooth corner joints.
    """
    bm = bmesh.new()

    points = [
        (-0.4 * size, 0.5 * size),
        (0.4 * size, 0.5 * size),
        (-0.4 * size, -0.5 * size),
        (0.4 * size, -0.5 * size),
    ]
    segments = [(points[0], points[1]), (points[1], points[2]), (points[2], points[3])]

    def _add_ring(
        cx: float, cy: float, nx: float, ny: float, r: float,
    ) -> list[bmesh.types.BMVert]:
        ring: list[bmesh.types.BMVert] = []
        if r < 0.0001:
            v = bm.verts.new((cx, cy, 0.0))
            return [v] * radial_segments
        for j in range(radial_segments):
            theta = 2.0 * math.pi * j / radial_segments
            ring.append(bm.verts.new((
                cx + nx * math.cos(theta) * r,
                cy + ny * math.cos(theta) * r,
                math.sin(theta) * r,
            )))
        return ring

    def _stitch(rings: list[list[bmesh.types.BMVert]]) -> None:
        for i in range(len(rings) - 1):
            ra, rb = rings[i], rings[i + 1]
            a_deg = radial_segments > 1 and ra[0] is ra[1]
            b_deg = radial_segments > 1 and rb[0] is rb[1]
            for j in range(radial_segments):
                nj = (j + 1) % radial_segments
                if a_deg and b_deg:
                    continue
                if a_deg:
                    try:
                        bm.faces.new((ra[0], rb[nj], rb[j]))
                    except ValueError:
                        pass
                elif b_deg:
                    try:
                        bm.faces.new((ra[j], ra[nj], rb[0]))
                    except ValueError:
                        pass
                else:
                    try:
                        bm.faces.new((ra[j], ra[nj], rb[nj], rb[j]))
                    except ValueError:
                        pass

    for (ax, ay), (bx, by) in segments:
        dx, dy = bx - ax, by - ay
        seg_len = math.sqrt(dx * dx + dy * dy)
        if seg_len < 0.0001:
            continue
        nx, ny = -dy / seg_len, dx / seg_len
        tx, ty = dx / seg_len, dy / seg_len

        all_rings: list[list[bmesh.types.BMVert]] = []

        for ci in range(cap_segments, 0, -1):
            phi = ci / cap_segments * (math.pi / 2.0)
            cap_r = tube_radius * math.cos(phi)
            cap_off = tube_radius * math.sin(phi)
            all_rings.append(_add_ring(
                ax - tx * cap_off, ay - ty * cap_off, nx, ny, cap_r,
            ))

        for li in range(length_segments + 1):
            t = li / length_segments
            all_rings.append(_add_ring(
                ax + dx * t, ay + dy * t, nx, ny, tube_radius,
            ))

        for ci in range(1, cap_segments + 1):
            phi = ci / cap_segments * (math.pi / 2.0)
            cap_r = tube_radius * math.cos(phi)
            cap_off = tube_radius * math.sin(phi)
            all_rings.append(_add_ring(
                bx + tx * cap_off, by + ty * cap_off, nx, ny, cap_r,
            ))

        _stitch(all_rings)

    for px, py in points:
        bmesh.ops.create_uvsphere(
            bm, u_segments=radial_segments, v_segments=radial_segments // 2,
            radius=tube_radius,
            matrix=mathutils.Matrix.Translation((px, py, 0.0)),
        )

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj)


# ---------------------------------------------------------------------------
# Utility: create a tapered gill spike with wave morph targets
# ---------------------------------------------------------------------------
def create_gill_spike(
    name: str,
    length: float = 0.35,
    base_radius: float = 0.06,
    tip_radius: float = 0.001,
    radial_segs: int = 8,
    length_segs: int = 10,
    wave_freq: float = 15.0,
    wave_amp: float = 0.02,
) -> bpy.types.Object:
    """Tapered cone along +X with morph targets for the SDF traveling wave.

    Shape keys GillWaveSin / GillWaveCos encode sin(x*freq)*amp and
    cos(x*freq)*amp displacements in Y.  At runtime, blending with weights
    cos(t*speed) and -sin(t*speed) reconstructs sin(x*freq - t*speed)*amp.
    """
    bm = bmesh.new()

    rings: list[list[bmesh.types.BMVert]] = []
    for li in range(length_segs + 1):
        t = li / length_segs
        x = t * length
        r = base_radius + (tip_radius - base_radius) * t

        ring: list[bmesh.types.BMVert] = []
        if r < 0.0005:
            v = bm.verts.new((x, 0, 0))
            ring = [v] * radial_segs
        else:
            for ri in range(radial_segs):
                angle = 2 * math.pi * ri / radial_segs
                ring.append(bm.verts.new((x, math.cos(angle) * r, math.sin(angle) * r)))
        rings.append(ring)

    for li in range(length_segs):
        top_degen = rings[li][0] is rings[li][1]
        bot_degen = rings[li + 1][0] is rings[li + 1][1]
        for ri in range(radial_segs):
            rj = (ri + 1) % radial_segs
            if top_degen and bot_degen:
                continue
            if top_degen:
                try:
                    bm.faces.new((rings[li][0], rings[li + 1][rj], rings[li + 1][ri]))
                except ValueError:
                    pass
            elif bot_degen:
                try:
                    bm.faces.new((rings[li][ri], rings[li][rj], rings[li + 1][0]))
                except ValueError:
                    pass
            else:
                try:
                    bm.faces.new((rings[li][ri], rings[li][rj], rings[li + 1][rj], rings[li + 1][ri]))
                except ValueError:
                    pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for f in mesh.polygons:
        f.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    link_obj(obj)

    obj.shape_key_add(name="Basis")
    sk_sin = obj.shape_key_add(name="GillWaveSin")
    sk_cos = obj.shape_key_add(name="GillWaveCos")

    basis = obj.data.shape_keys.key_blocks["Basis"]
    for vi in range(len(mesh.vertices)):
        x = basis.data[vi].co.x
        sin_dy = math.sin(x * wave_freq) * wave_amp
        cos_dy = math.cos(x * wave_freq) * wave_amp
        sk_sin.data[vi].co = basis.data[vi].co + mathutils.Vector((0, sin_dy, 0))
        sk_cos.data[vi].co = basis.data[vi].co + mathutils.Vector((0, cos_dy, 0))

    return obj


# ---------------------------------------------------------------------------
# Utility: create a rounded box with a rotated transform applied
# ---------------------------------------------------------------------------
def create_rotated_rounded_box(
    name: str,
    half_extents: tuple[float, float, float],
    radius: float,
    location: tuple[float, float, float],
    rotation_z: float = 0.0,
) -> bpy.types.Object:
    obj = create_rounded_box(name, half_extents, radius)
    obj.location = location
    obj.rotation_euler = (0, 0, rotation_z)
    return obj


# ===== THEME BODY BUILDERS ================================================


# ---------------------------------------------------------------------------
# Ghost body: capsule top + wavy-bottom skirt
# ---------------------------------------------------------------------------
def create_ghost_body(name: str) -> bpy.types.Object:
    """Ghost body matching the SDF capped-line capsule with smoothstep radius
    expansion and capsule bottom rounding.

    Shape keys GhostWaveSin / GhostWaveCos encode the skirt traveling-wave
    decomposition.  At runtime, blending with weights cos(t*3) and sin(t*3)
    reconstructs sin(angle*7 + t*3) * 0.04 * mask.
    """
    bm = bmesh.new()
    seg_top = 0.15
    seg_bot = -0.15
    base_radius = 0.28
    expand = 0.15
    floor_y = -0.28
    segs = 24
    v_rings = 20
    wavy_segs = 7
    dome_frac = 0.35

    def ss(edge0: float, edge1: float, x: float) -> float:
        t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
        return t * t * (3.0 - 2.0 * t)

    rings: list[list[bmesh.types.BMVert]] = []
    vert_meta: list[tuple[float, float]] = []

    for ri in range(v_rings + 1):
        t = ri / v_rings
        if t < dome_frac:
            frac = t / dome_frac
            angle = (1.0 - frac) * math.pi / 2
            y = seg_top + math.sin(angle) * base_radius
            big_r = math.cos(angle) * base_radius
            wave_mask = 0.0
        else:
            frac = (t - dome_frac) / (1.0 - dome_frac)
            y = seg_top * (1.0 - frac) + floor_y * frac
            big_r = base_radius + ss(0.1, -0.25, y) * expand
            wave_mask = ss(-0.1, -0.3, y) * 0.04

        ring: list[bmesh.types.BMVert] = []
        for si in range(segs):
            a = 2 * math.pi * si / segs
            if y < seg_bot and t >= dome_frac:
                dy = y - seg_bot
                r = math.sqrt(max(0.0, big_r * big_r - dy * dy))
            else:
                r = max(big_r, 0.0)
            ring.append(bm.verts.new((math.cos(a) * r, y, math.sin(a) * r)))
            vert_meta.append((a, wave_mask))
        rings.append(ring)

    for ri in range(len(rings) - 1):
        for si in range(segs):
            sj = (si + 1) % segs
            try:
                bm.faces.new((rings[ri][si], rings[ri][sj], rings[ri + 1][sj], rings[ri + 1][si]))
            except ValueError:
                pass

    top_v = bm.verts.new((0, seg_top + base_radius, 0))
    vert_meta.append((0.0, 0.0))
    for si in range(segs):
        sj = (si + 1) % segs
        try:
            bm.faces.new((top_v, rings[0][sj], rings[0][si]))
        except ValueError:
            pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    link_obj(obj)

    obj.shape_key_add(name="Basis")
    sk_sin = obj.shape_key_add(name="GhostWaveSin")
    sk_cos = obj.shape_key_add(name="GhostWaveCos")

    basis = obj.data.shape_keys.key_blocks["Basis"]
    for vi, (a, mask) in enumerate(vert_meta):
        if mask < 1e-8:
            continue
        sin_d = -math.sin(a * wavy_segs) * mask
        cos_d = -math.cos(a * wavy_segs) * mask
        rx, rz = math.cos(a), math.sin(a)
        base = basis.data[vi].co
        sk_sin.data[vi].co = base + mathutils.Vector((rx * sin_d, 0, rz * sin_d))
        sk_cos.data[vi].co = base + mathutils.Vector((rx * cos_d, 0, rz * cos_d))

    return obj


# ===== BUILD INDIVIDUAL THEMES (body geometry only) ========================

def build_theme_cat(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_Cat")
    set_parent(theme_root, parent)

    body = create_rounded_box("Body_Cat", (0.42, 0.3, 0.18), 0.12)
    project_front_uvs(body)
    set_parent(body, theme_root)

    for side in (1, -1):
        ear = create_rotated_rounded_box(
            f"Ear_{'R' if side > 0 else 'L'}_Cat",
            (0.08, 0.14, 0.04), 0.03,
            (side * 0.26, 0.32, 0.0), rotation_z=-0.4 * side,
        )
        set_parent(ear, body)

    bell = create_sphere("Bell_Cat", 0.06, (0.0, -0.35, 0.30))
    set_parent(bell, body)


def build_theme_owl(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_Owl")
    set_parent(theme_root, parent)

    body = create_rounded_box("Body_Owl", (0.34, 0.34, 0.20), 0.20)
    project_front_uvs(body)
    set_parent(body, theme_root)

    for side in (1, -1):
        tuft = create_rotated_rounded_box(
            f"Tuft_{'R' if side > 0 else 'L'}_Owl",
            (0.07, 0.12, 0.04), 0.04,
            (side * 0.22, 0.42, 0.0), rotation_z=-0.35 * side,
        )
        set_parent(tuft, body)

    beak = create_rounded_box("Beak_Owl", (0.035, 0.03, 0.04), 0.02)
    beak.location = (0.0, -0.08, 0.22)
    beak.rotation_euler = (0, 0, math.pi / 4)
    set_parent(beak, body)


def build_theme_ghost(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_Ghost")
    set_parent(theme_root, parent)

    body = create_ghost_body("Body_Ghost")
    project_front_uvs(body)
    set_parent(body, theme_root)

    for side in (1, -1):
        arm = create_rounded_box("Arm_" + ("R" if side > 0 else "L") + "_Ghost", (0.1, 0.02, 0.02), 0.04)
        arm.location = (side * 0.35, 0.0, 0.0)
        arm.rotation_euler = (0, 0, 0.5 * side)
        set_parent(arm, body)

    mouth = create_sphere("Mouth_Ghost", 0.08, (0.0, -0.05, 0.15))
    set_parent(mouth, body)


def build_theme_axolotl(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_Axolotl")
    set_parent(theme_root, parent)

    body = create_rounded_box("Body_Axolotl", (0.45, 0.22, 0.2), 0.15)
    project_front_uvs(body)
    set_parent(body, theme_root)

    gills = make_empty("Gills_Axolotl")
    set_parent(gills, body)
    for side in (1, -1):
        for gi in range(-1, 2):
            spike_name = f"Gill_{side}_{gi}_Axolotl"
            spike = create_gill_spike(spike_name)
            spike.location = (side * 0.42, gi * 0.12, 0.0)
            y_rot = math.pi if side < 0 else 0.0
            z_rot = 0.4 * gi * side
            spike.rotation_euler = (0, y_rot, z_rot)
            set_parent(spike, gills)

    belly = create_sphere("Belly_Axolotl", 0.05, (0.0, -0.35, 0.25))
    set_parent(belly, body)


def build_theme_crt(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_CRT")
    set_parent(theme_root, parent)

    body = create_rounded_box("Body_CRT", (0.4, 0.32, 0.25), 0.05)

    cutter = create_rounded_box("_CRT_Cutter", (0.32, 0.24, 0.05), 0.05)
    cutter.location = (0.0, 0.0, 0.25)

    bool_mod = body.modifiers.new(name="ScreenCut", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = cutter
    bool_mod.solver = 'EXACT'

    bpy.context.view_layer.objects.active = body
    with bpy.context.temp_override(active_object=body):
        bpy.ops.object.modifier_apply(modifier="ScreenCut")

    bpy.data.objects.remove(cutter, do_unlink=True)

    project_front_uvs(body)
    set_parent(body, theme_root)

    screen = create_rounded_box("Screen_CRT", (0.32, 0.24, 0.05), 0.05)
    for v in screen.data.vertices:
        v.co.z += 0.25
    project_front_uvs(screen)
    set_parent(screen, body)

    for side in (1, -1):
        antenna = create_rounded_box(
            f"Antenna_{'R' if side > 0 else 'L'}_CRT",
            (0.01, 0.18, 0.01), 0.01,
        )
        antenna.location = (side * 0.15, 0.35, 0.0)
        antenna.rotation_euler = (0, 0, -0.4 * side)
        set_parent(antenna, body)

        tip = create_sphere(
            f"AntennaTip_{'R' if side > 0 else 'L'}_CRT",
            0.03, (0.0, 0.18, 0.0),
        )
        set_parent(tip, antenna)


def build_theme_robot(parent: bpy.types.Object) -> None:
    theme_root = make_empty("Theme_Robot")
    set_parent(theme_root, parent)

    body = create_rounded_box("Body_Robot", (0.42, 0.3, 0.22), 0.12)
    project_front_uvs(body)
    set_parent(body, theme_root)

    for side in (1, -1):
        ear = create_rounded_box(
            f"Ear_{'R' if side > 0 else 'L'}_Robot",
            (0.02, 0.12, 0.06), 0.04,
        )
        ear.location = (side * 0.58, 0.0, 0.0)
        set_parent(ear, body)

    stalk = create_rounded_box("Stalk_Robot", (0.005, 0.1, 0.005), 0.01)
    stalk.location = (0.0, 0.5, 0.0)
    set_parent(stalk, body)

    ball = create_sphere("AntennaBall_Robot", 0.07, (0.0, 0.68, 0.0))
    set_parent(ball, body)


# ===== STATE OVERLAY BUILDERS =============================================

def build_wifi(parent: bpy.types.Object, theme_idx: int = 5) -> bpy.types.Object:
    wifi_root = make_empty("WiFi")
    set_parent(wifi_root, parent)
    wy = WIFI_YS[theme_idx]

    dot = create_sphere("WiFi_Dot", 0.045, (0.0, wy, 0.25))
    set_parent(dot, wifi_root)

    inner = create_tube_arc("WiFi_Arc_Inner", 0.12, 0.025, 0.785)
    inner.location = (0.0, wy, 0.25)
    set_parent(inner, wifi_root)

    outer = create_tube_arc("WiFi_Arc_Outer", 0.22, 0.025, 0.785)
    outer.location = (0.0, wy, 0.25)
    set_parent(outer, wifi_root)

    return wifi_root


def build_question_mark(parent: bpy.types.Object, theme_idx: int = 5) -> bpy.types.Object:
    qm_root = make_empty("QuestionMark")
    set_parent(qm_root, parent)
    wy = WIFI_YS[theme_idx]
    base_y = wy + 0.15

    dot = create_sphere("QM_Dot", 0.045, (0.0, base_y - 0.20, 0.25))
    set_parent(dot, qm_root)

    stem = create_rounded_box("QM_Stem", (0.02, 0.06, 0.02), 0.018)
    stem.location = (0.0, base_y - 0.06, 0.25)
    set_parent(stem, qm_root)

    hook = create_partial_torus_ring(
        "QM_Hook", 0.10, 0.03,
        start_angle=-math.pi / 2, end_angle=math.pi,
    )
    hook.location = (0.0, base_y + 0.10, 0.25)
    set_parent(hook, qm_root)

    return qm_root


def build_wave_bars(parent: bpy.types.Object, theme_idx: int = 5) -> bpy.types.Object:
    bars_root = make_empty("WaveBars")
    set_parent(bars_root, parent)

    wx = WAVE_XS[theme_idx]
    wy = WAVE_YS[theme_idx]
    w_spread = WAVE_SPREADS[theme_idx]
    w_rot = WAVE_ROTS[theme_idx]

    for i in range(4):
        progress = i / 3.0
        h = 0.08 * (1.0 - progress * 0.5) + 0.02
        bar = create_rounded_box(f"WaveBar_{i}", (0.006, h, 0.006), 0.005)
        bx = wx + progress * w_spread
        bar.location = (bx, wy, 0.0)
        bar.rotation_euler = (0, 0, w_rot)
        set_parent(bar, bars_root)

    return bars_root


def build_click_rings(parent: bpy.types.Object) -> bpy.types.Object:
    rings_root = make_empty("ClickRings")
    set_parent(rings_root, parent)

    ring_specs = [
        ("ClickRing_1", 0.72, 0.04),
        ("ClickRing_2", 0.88, 0.006),
        ("ClickRing_3", 1.05, 0.02),
    ]
    for ring_name, major_r, minor_r in ring_specs:
        ring = create_torus_ring(ring_name, major_r, max(minor_r, 0.004))
        ring.location = (0, 0.05, 0)
        set_parent(ring, rings_root)

    return rings_root


def build_sleep_zs(parent: bpy.types.Object) -> bpy.types.Object:
    zs_root = make_empty("SleepZs")
    set_parent(zs_root, parent)

    for i in range(3):
        life = i * 0.33
        z_size = 0.06 + life * 0.08
        z_obj = create_z_mesh(f"SleepZ_{i}", z_size, 0.018)
        z_obj.location = (0.25, -0.2 + life * 1.2, 0.0)
        set_parent(z_obj, zs_root)

    return zs_root


# ===== MATERIAL SETUP =====================================================

def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if obj.type == "MESH":
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat
    for child in obj.children:
        assign_material(child, mat)


def create_default_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Alpha"].default_value = color[3]
    return mat


# ===== MAIN ASSEMBLY ======================================================

def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    root_col = bpy.context.scene.collection
    for col in list(bpy.data.collections):
        if col != root_col:
            bpy.data.collections.remove(col)


def build_and_export():
    clear_scene()

    root = make_empty("Robot_Assembly")

    theme_builders = [
        build_theme_cat,
        build_theme_owl,
        build_theme_ghost,
        build_theme_axolotl,
        build_theme_crt,
        build_theme_robot,
    ]
    THEME_SPACING = 1.0
    for i, builder in enumerate(theme_builders):
        builder(root)
        theme_obj = bpy.data.objects.get(f"Theme_{THEME_NAMES[i]}")
        if theme_obj:
            theme_obj.location.x = (i - (len(theme_builders) - 1) / 2) * THEME_SPACING

    overlays = make_empty("State_Overlays")
    set_parent(overlays, root)
    overlays.location.x = ((len(theme_builders)) - (len(theme_builders) - 1) / 2) * THEME_SPACING

    build_wifi(overlays)
    build_question_mark(overlays)
    build_wave_bars(overlays)
    build_click_rings(overlays)
    build_sleep_zs(overlays)

    body_mat = create_default_material("Bot_Body", (0.6, 0.8, 1.0, 1.0))
    accent_mat = create_default_material("Bot_Accent", (0.2, 0.6, 1.0, 1.0))
    overlay_mat = create_default_material("Bot_Overlay", (0.3, 0.9, 1.0, 1.0))

    for theme_name in THEME_NAMES:
        theme_obj = bpy.data.objects.get(f"Theme_{theme_name}")
        if not theme_obj:
            continue
        for child in theme_obj.children:
            cname = child.name
            if cname.startswith("Body_") or cname.startswith("Arm_"):
                assign_material(child, body_mat)
            else:
                assign_material(child, accent_mat)
        screen_obj = bpy.data.objects.get(f"Screen_{theme_name}")
        if screen_obj:
            assign_material(screen_obj, accent_mat)

    assign_material(overlays, overlay_mat)

    # SDF shader uses Y-up / Z-front; Blender uses Z-up / -Y-front.
    # Rotate root so shader Y maps to Blender Z (up) and shader Z maps to -Y (forward).
    # The GLTF exporter's export_yup converts back to Y-up for Lens Studio.
    root.rotation_euler[0] = math.radians(90)

    bpy.context.view_layer.update()

    for obj in bpy.data.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    export_path = os.path.join(
        os.path.dirname(bpy.data.filepath) if bpy.data.filepath else os.path.expanduser("~/Desktop"),
        OUTPUT_FILENAME,
    )
    print(f"--- EXPORTING: {export_path} ---")

    override = bpy.context.copy()
    override["active_object"] = root
    override["selected_objects"] = list(bpy.data.objects)
    with bpy.context.temp_override(**override):
        bpy.ops.export_scene.gltf(
            filepath=export_path,
            export_format='GLB',
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_morph=True,
        )

    total_verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == 'MESH')
    total_faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    mesh_count = sum(1 for o in bpy.data.objects if o.type == 'MESH')
    print(f"--- DONE: {export_path} ---")
    print(f"Total mesh objects: {mesh_count}")
    print(f"Total verts: {total_verts}")
    print(f"Total faces: {total_faces}")


if __name__ == "__main__":
    build_and_export()
