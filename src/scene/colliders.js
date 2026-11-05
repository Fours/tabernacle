// 2D (XZ-plane) collision primitives in meters.
// AABB: { type: 'box', minX, maxX, minZ, maxZ }   Circle: { type: 'circle', x, z, r }
// Oriented box: { type: 'obb', x, z, c, s, hx, hz } (centre, cos/sin of yaw, half extents)
// Grid: { type: 'grid', near(x, z) → array of colliders } — a spatial lookup standing for
// many colliders (e.g. the camp's tents) so resolveCircle only tests the ones nearby.

export const box = (cx, cz, sx, sz) => ({
  type: 'box',
  minX: cx - sx / 2,
  maxX: cx + sx / 2,
  minZ: cz - sz / 2,
  maxZ: cz + sz / 2,
});

export const circle = (x, z, r) => ({ type: 'circle', x, z, r });

/** Oriented box: centre (x, z), half extents along its local x / z, rotated by yaw about +Y. */
export const obb = (x, z, yaw, hx, hz) => ({ type: 'obb', x, z, c: Math.cos(yaw), s: Math.sin(yaw), hx, hz });

/**
 * Spatial grid over many colliders: each is filed in every `cell`-sized square its bounding
 * circle (`bound(c)` → [x, z, r], padded by `pad`) touches. Lookups return the colliders filed
 * in the query point's cell.
 */
export function grid(items, bound, { cell = 8, pad = 0.5 } = {}) {
  const map = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const it of items) {
    const [x, z, r] = bound(it);
    const R = r + pad;
    for (let i = Math.floor((x - R) / cell); i <= Math.floor((x + R) / cell); i++) {
      for (let j = Math.floor((z - R) / cell); j <= Math.floor((z + R) / cell); j++) {
        const k = key(i, j);
        let list = map.get(k);
        if (!list) map.set(k, (list = []));
        list.push(it);
      }
    }
  }
  const empty = [];
  return { type: 'grid', near: (x, z) => map.get(key(Math.floor(x / cell), Math.floor(z / cell))) || empty };
}

// Push pos out of one collider; returns true if it moved.
function resolveOne(pos, r, c) {
  if (c.type === 'obb') {
    // Into the box's frame (local x = (c, -s), local z = (s, c) for yaw about +Y).
    const dx0 = pos.x - c.x, dz0 = pos.z - c.z;
    const lx = dx0 * c.c - dz0 * c.s;
    const lz = dx0 * c.s + dz0 * c.c;
    const qx = Math.min(Math.max(lx, -c.hx), c.hx);
    const qz = Math.min(Math.max(lz, -c.hz), c.hz);
    let nx, nz;
    if (qx === lx && qz === lz) {
      // Centre inside: out along the shallowest axis.
      const ex = c.hx - Math.abs(lx), ez = c.hz - Math.abs(lz);
      if (ex < ez) { nx = Math.sign(lx || 1) * (c.hx + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (c.hz + r); }
    } else {
      const ddx = lx - qx, ddz = lz - qz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 >= r * r) return false;
      const d = Math.sqrt(d2) || 1e-6;
      nx = qx + (ddx / d) * r;
      nz = qz + (ddz / d) * r;
    }
    pos.x = c.x + nx * c.c + nz * c.s;
    pos.z = c.z - nx * c.s + nz * c.c;
    return true;
  }
  let px, pz, minDist;
  if (c.type === 'box') {
    px = Math.min(Math.max(pos.x, c.minX), c.maxX);
    pz = Math.min(Math.max(pos.z, c.minZ), c.maxZ);
    minDist = r;
    if (px === pos.x && pz === pos.z) {
      // Center inside the box: push out along the shallowest axis.
      const dl = pos.x - c.minX, dr = c.maxX - pos.x;
      const dn = pos.z - c.minZ, ds = c.maxZ - pos.z;
      const mn = Math.min(dl, dr, dn, ds);
      if (mn === dl) pos.x = c.minX - r;
      else if (mn === dr) pos.x = c.maxX + r;
      else if (mn === dn) pos.z = c.minZ - r;
      else pos.z = c.maxZ + r;
      return true;
    }
  } else {
    px = c.x;
    pz = c.z;
    minDist = r + c.r;
  }
  const dx = pos.x - px, dz = pos.z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 < minDist * minDist) {
    const d = Math.sqrt(d2) || 1e-6;
    const push = minDist - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
    return true;
  }
  return false;
}

/**
 * Push a circle (player) at pos {x,z} with radius r out of all colliders.
 * Mutates pos. Iterates a few times so corners resolve cleanly.
 */
export function resolveCircle(pos, r, colliders, iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of colliders) {
      if (c.type === 'grid') {
        for (const g of c.near(pos.x, pos.z)) if (resolveOne(pos, r, g)) moved = true;
      } else if (resolveOne(pos, r, c)) moved = true;
    }
    if (!moved) break;
  }
  return pos;
}
