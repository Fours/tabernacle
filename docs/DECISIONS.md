# Decisions

These are the interpretive and technical choices currently in force, grouped by topic. When a
choice changes, edit its entry in place; don't append a contradicting one. Add new entries
under the right heading in this format: `YYYY-MM-DD: decision — reason`.

## Interpretation of the text

- 2026-11-04: Cubit = 0.45 m — a common scholarly value.
- 2026-11-04: The Tabernacle has a flat roof with the coverings draped over the boards — this
  follows rabbinic tradition, rather than a ridged tent.
- 2026-11-04: Placement follows the two-squares layout. The Holy of Holies is centered in the
  western 50×50 square and the altar in the eastern square.
- 2026-11-04: Boards are 1 cubit thick — rabbinic tradition; the text doesn't give a thickness.
- 2026-11-04: Torches are artistic license, added for light and atmosphere.

## Courtyard

- 2026-11-04: 60 pillars stand every 5 cubits around the perimeter. The "4 gate + 3 + 3"
  count is reconciled by crediting each pillar with one 5-cubit span. So the 20-cubit gate has
  posts at z = −10, −5, 0, +5, +10 cubits, with one in the middle.
- 2026-11-05: Each pillar shaft is 5.25 cubits including the socket, plus a 0.3-cubit silver
  capital — this lets the 5-cubit hanging hang from hooks and still clear the ground. Sockets
  are 0.8×0.8×0.5 cubits.
- 2026-11-05: The hangings and gate screen hang from silver hooks on the inner side of the
  pillar line. Fillets are silver rods joining neighbouring capitals.
- 2026-11-05: Each pillar has one bronze peg and cord, staked 3 cubits outward (diagonally at
  the corners).
- 2026-11-05: The gate screen embroidery is geometric only (bands, lozenges, eight-pointed
  stars). No figures.

## Bronze altar & laver

- 2026-11-05: The altar is hollow, with walls 0.35 cubit thick. It is filled with earth to
  0.45 cubit below the rim as a hearth (rabbinic). `altar.userData.hearth = {x, y, z, size}` is
  in world meters.
- 2026-11-05: The horns are 1 cubit tall (rabbinic), blunt and curved. Each has a 0.3-cubit
  base and 0.09-cubit tip. They are a separate mesh that casts no shadow — otherwise they throw
  long wedge shadows.
- 2026-11-05: The ledge top is at 2.25 cubits and projects 0.6. The bronze network hangs from
  the ledge edge down to 1.5 cubits (halfway up the altar). The carrying poles run E–W on the
  north and south sides and stick out 1.5 cubits past the rings.
- 2026-11-05: The utensils lie south of the altar and don't collide. The laver is a
  reconstruction: a human-scale bronze basin on a foot and stem, rim at about 0.9 m.

## Tabernacle tent

- 2026-11-05: Boards sit in 1-cubit silver sockets (as tenons, per Rashi on 26:17), so the
  walls stay 10 cubits tall. The west wall is 6 boards plus 2 corner boards, covering the ends
  of the side walls.
- 2026-11-05: All 5 bars per wall are on the outside of the boards, held by gold rings. The
  top and bottom rows are two half-length bars each; the middle bar runs the full length.
- 2026-11-05: The entrance pillars stand at x = +0.4 cubits, z = −5 … +5. The screen hangs from
  gold hooks on their inner side.
- 2026-11-05: Goat-hair covering:
  - The side hem is at 1.55 cubits, not 1, so the gold boards show above the sockets.
  - The back hem is at 0.15 cubit.
  - The doubled sixth curtain is a 2-cubit flap over the front.
  - The clasp line (50 bronze clasps) is at x ≈ −21 cubits.
- 2026-11-05: The inner linen covering is modelled only as the ceiling seen from inside: a sheet
  0.01 cubit above the board tops, sagging with the goat hair. Curtains run N–S with seams every
  4 cubits; the woven figures stand head to the east. 18 gold clasps hang at x = −20. The loops
  (Ex 26:4) aren't modelled.
- 2026-11-05: Veil (`scene/veil.js`): cloth at x = −20 from just under the ceiling to just above
  the ground. 4 gold pillars (radius 0.25, no capitals, Ex 36:36) at z = ±1.25 and ±3.75, centers
  0.45 cubit west of the cloth, on silver sockets 0.8 cubit square × 1 high; gold hooks on their
  east face. Same weave on both sides.
- 2026-11-05: The entrance screen casts shadows, so the altar's shadowed light doesn't shine
  into the Holy Place.
- 2026-11-05: The ram skins (red) and tachash cover the roof only. The ram skins droop about
  1 cubit over the edges; the tachash is inset 0.6 cubit.
- 2026-11-05: The tent has 18 bronze pins with cords (Ex 35:18). They don't collide.

## Interior furnishings

- 2026-11-05: Menorah (`scene/menorah.js`, `MENORAH` in dimensions.js) follows the Menachot 28b
  layout: 18 handbreadths (3 cubits) tall on a tripod base; semicircular arms centred on the
  shaft at 14.5 handbreadths (radii 6, 4, 2), leaving from knobs at 8.5, 10.5 and 12.5
  handbreadths. Cups are flared almond calyxes opening upward. Outer lamps face the centre; the
  middle lamp faces west, toward the veil (Menachot 98b). At x = −8, z = +2.5 cubits, branches
  E–W. One merged mesh, no shadow. Tongs and snuff dishes aren't modelled.

## Fire & lighting

- 2026-11-05: The altar fire is a 3-layer log-cabin stack of charred logs on a coal bed (the
  *ma'arakhah*), with more logs leaning against it. The logs use the acacia texture; the
  Mishnah's wood types (Tamid 2) aren't modelled.
- 2026-11-05: The altar PointLight is the only shadow caster: 0xff8a3a, 105 cd, decay 1.5,
  1.2 m above the hearth, 1024 cube map, PCF radius 5. Decay 1.5 isn't physical; it lets the
  light reach the far side of the courtyard.
  - An unshadowed 14 cd fill light sits 3.2 m above the fire.
  - The altar bronze uses `shadowSide = DoubleSide`, which fixes a light leak along its base.
  - `addFireBounce` fakes firelight bouncing off the sand onto the altar's walls.
- 2026-11-05: There are 10 torches, positions in `TORCHES`. 8 have non-shadow 28 cd point
  lights; the 2 west outside corner torches only glow. With the menorah's light that makes
  11 point lights in total.
  Torch fires have no smoke.
- 2026-11-05: Each torch is a 2.4 m wooden post in a stone cairn, with a charred,
  pitch-soaked cloth wrap on top and glowing HDR cracks.
- 2026-11-05: The menorah has one warm point light (0xffc080, 8 cd, decay 1.6, no shadow),
  0.3 m above and 0.35 m north of the lamps. Its 7 flames are one instanced emissive draw
  (`createLampFlames` in fire.js), not `createFire`.
- 2026-11-05: Interior light mask (`scene/interiorLight.js`, `applyInteriorMask(scene)` in
  main.js) patches every `MeshStandardMaterial`. A fragment pushed 0.3 m along its normal is
  tested against the tent's interior box. Point lights are classed inside/outside by position
  and only light fragments on their own side. Inside, the moon, hemisphere fill and env map
  are cut (30% cool spill in the first 1.5 m from the entrance) and replaced by a warm room
  ambient that flickers with the lamps and fades with distance from the menorah. West of the
  veil, menorah light and ambient drop to 5%. Tuning uniforms: `__tabernacle.interior`.
- 2026-11-05: Inside the tent, metals are burnished: roughness ≥ 0.45, 40% diffuse, room
  reflections tinted by the metal colour. The board texture's burnish streaks are fainter.
- 2026-11-05: The night fill is a hemisphere light at 0.22 plus a moon directional light at
  0.16 from (−40, 80, 30).

## Rendering

- 2026-11-05: Tone mapping is ACES Filmic, exposure 1.1, sRGB output — AgX washed out the
  firelight.
- 2026-11-05: Post chain in `render/postfx.js`, in order:
  1. MSAA half-float render.
  2. Bloom (threshold 2.0, strength 0.6, radius 0.55).
  3. Night grade: cool lift in the darks, vignette, grain, heat shimmer above the altar.
  4. OutputPass.
- 2026-11-05: Night haze is `FogExp2(0x0b0f1c, 0.012)`. Additive fire sprites fade to black in
  fog; smoke uses the normal fog mix.
- 2026-11-05: The night environment is generated in `render/environment.js` (intensity 0.35):
  cool sky with a warm band at the horizon, so metals pick up warm reflections.
- 2026-11-05: Ambient occlusion is skipped. GTAO needs a second scene render (about 85 more
  draw calls) and clashes with the transparent fire sprites.
- 2026-11-05: The sky is a dome that follows the camera (`scene/sky.js`, 1 draw call):
  - Stars are drawn in anti-aliased hashed cells, 5 layers.
  - Milky Way with dust lanes.
  - Slow twinkle.
  - A small dim moon along the moon-light direction.
  - The horizon and everything below it use the fog color.
- 2026-11-05: `createCherubimTexture` (textiles.js) draws the woven cherubim — a robed,
  front-facing figure with spread wings — for both the ceiling and the veil. `?light=work` adds an
  unshadowed 8 cd point light inside the tent at (−4.5, 1.8, 0) m.
- 2026-11-05: Materials:
  - `addMacroVariation` breaks up visible tiling.
  - The goat-hair texture tile spans 2 curtains × 4 cubits.
  - The skin textures tile every 8×8 cubits.
  - The tachash is dark brown leather.

## Camera & controls

- 2026-11-05: First person is the default. `?view=<preset>` switches to the free camera,
  except `walk`; `?cam=` always wins.
- 2026-11-04: The player has a 0.3 m radius and walks at 1.4 m/s (3.5 m/s running). The
  `walk` spawn is at z = +2.5 cubits, in the gap south of the middle gate pillar.
- 2026-11-04: WASD works without pointer lock, because the in-app browser pane refuses
  pointer lock; mouse look still needs it.
- 2026-11-05: `PLAYER.lookSpeed` is 0.7. Head bob is vertical only and on by default.
- 2026-11-04: Gate screens and hangings people walk through don't collide; the gate pillars
  do. The tent's entrance screen is walk-through; the entrance pillar sockets, side and west
  walls and the veil collide, so the player can reach x ≈ −19.2 cubits in the Holy Place.
- 2026-11-04: The `top` preset uses a very high camera with a narrow field of view, close to
  orthographic, so proportions can be measured from screenshots.

## Performance baseline (2026-11-05)

- About 3.7–5.2 ms per frame at 2048×1536 with the post chain on, and 78–102 draw calls
  depending on the view.
- About 190k scene triangles. With the 6 cube-shadow passes, about 855k triangles are drawn
  per frame.
