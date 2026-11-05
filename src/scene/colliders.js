// 2D (XZ-plane) collision primitives in meters.
// AABB: { type: 'box', minX, maxX, minZ, maxZ }   Circle: { type: 'circle', x, z, r }

export const box = (cx, cz, sx, sz) => ({
  type: 'box',
  minX: cx - sx / 2,
  maxX: cx + sx / 2,
  minZ: cz - sz / 2,
  maxZ: cz + sz / 2,
});

export const circle = (x, z, r) => ({ type: 'circle', x, z, r });

/**
 * Push a circle (player) at pos {x,z} with radius r out of all colliders.
 * Mutates pos. Iterates a few times so corners resolve cleanly.
 */
export function resolveCircle(pos, r, colliders, iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of colliders) {
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
          moved = true;
          continue;
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
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos;
}
