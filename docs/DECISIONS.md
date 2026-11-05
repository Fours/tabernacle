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
- 2026-11-05: The gate stands open (artistic license, at the user's direction, so the player
  can walk in). Ex 27:16 gives the gate 4 pillars; this build had a post at z = 0 and now
  leaves it out, drawing the two middle panels aside.
- 2026-11-05: The pillar of fire (Num 9:15–16) stands over the Holy of Holies (x = −25,
  z = 0 cubits). Its sizes are artistic license. The cloud by day isn't built. Revised the same
  day: the fire hangs in the sky ~4 m above the roof (foot at 8.5 m), a 24 m column whose foot
  tapers almost to a point over ~4.5 m. Above that it narrows very slowly (to ~45% at its top)
  and fades out over its upper 60%, its color drifting to the shaft's yellow, so it hands over
  smoothly to a thin (0.55 m) yellowish shaft 150 m tall, fading gradually as if reaching the
  clouds.
- 2026-11-05: The tent door stands open too (same reason). Ex 26:37's 5 entrance pillars are
  left out; a gold-overlaid acacia beam between the front boards (underside at 9.5 cubits,
  0.5 × 0.5 cubit; not in the text) carries the screen.
- 2026-11-05: At the user's direction the door is now half closed: the south half (the
  player's left, seen from the courtyard) hangs drawn across to the middle of the doorway
  from hooks every ~0.32 m, with soft folds (`addHangingHalf` in `tabernacle.js`). The north
  half stays gathered and tied back. The drawn half has no collider, so the player can walk
  through it as well as through the open half.

## Courtyard

- 2026-11-04: 60 pillars stand every 5 cubits around the perimeter. The "4 gate + 3 + 3"
  count is reconciled by crediting each pillar with one 5-cubit span. So the 20-cubit gate has
  posts at z = −10, −5, 0, +5, +10 cubits, with one in the middle. The middle post is now
  left out so the gate stands open (see "Interpretation of the text"), so 59 pillars stand.
- 2026-11-05: The two middle gate panels (z = −5 … +5 cubits) are drawn aside: procedural
  pleated meshes (`addGatheredDrape` in courtyard.js) gathered at the posts at z = ±5 and tied
  back at 2.6 cubits with a purple cord (`COURTYARD.gateOpenHalf`, `gateTieHeight`). The fillet
  spans the 10-cubit opening. Drapes and cords are part of the single `gate-screen` mesh; the
  cords sample the texture's purple border band. Each drape has a 0.17 m circle collider.
- 2026-11-05: Each pillar shaft is 5.25 cubits including the socket, plus a 0.3-cubit silver
  capital — this lets the 5-cubit hanging hang from hooks and still clear the ground. Sockets
  are 0.8×0.8×0.5 cubits.
- 2026-11-05: The hangings and gate screen hang from silver hooks on the inner side of the
  pillar line. Fillets are silver rods joining neighbouring capitals.
- 2026-11-05: Each pillar has one bronze peg and cord, staked 3 cubits outward (diagonally at
  the corners).
- 2026-11-05: The gate screen has garden embroidery in an ancient Near Eastern manner (at the
  user's direction, replacing the earlier geometric design): a running blue vine with
  palmettes, hanging lilies and pomegranates (blue, purple, scarlet, after Ex 28:33), and
  rosette borders. No figures. It repeats every 2.5 cubits, so it survives being gathered.

## Bronze altar & laver

- 2026-11-05: The altar is hollow, with walls 0.35 cubit thick. A heavy cast bronze grate
  (8 × 8 square bars, 0.2 cubit wide, 0.62 pitch; not in the text — the Ex 27:4 network stays
  the exterior one) sits 0.18 cubit below the rim and holds the fire. Beneath it, 0.9 cubit
  below the rim, is a glowing ember bed (coals only, no visible wood) that shows through the
  gaps. The grate's heat tint is baked per vertex with an emissive glow on its undersides; it
  casts no shadow. `altar.userData.hearth = {x, y, bedY, z, size}` in world meters: `y` is the
  grate top, `bedY` the ember bed.
- 2026-11-05: The horns are 1 cubit tall (rabbinic), blunt and curved. Each has a 0.3-cubit
  base and 0.09-cubit tip. Over the lower 22% (`hornFoot`) each horn's section morphs from a
  0.6-cubit square, whose outer faces are flush with the outer walls at the corner, into the
  round horn, so it rises out of the corner as one piece; a cap closes the foot's underside.
  The horns carry the walls' plate texture, box-projected in cubits per triangle
  (`cubitUVsPerFace`), so mottling, patina and seams continue from the walls. They are a
  separate mesh that casts no shadow — otherwise they throw long wedge shadows. A molded
  version (horns growing out of a cast rim lip with fillets) was tried and reverted at the
  user's request: it looked worse.
- 2026-11-05: The ledge top is at 2.25 cubits and projects 0.6. The bronze network hangs from
  the ledge edge down to 1.5 cubits (halfway up the altar). The carrying poles run E–W on the
  north and south sides and stick out 1.5 cubits past the rings.
- 2026-11-05: The utensils lie south of the altar and don't collide. The laver is a
  reconstruction: a human-scale bronze basin on a foot and stem, rim at about 0.9 m.
- 2026-11-05: Laver detail (`scene/laver.js`, 3 draws): stepped, beaded foot; 16-flute stem
  with a knop; basin with a lotus-and-bud frieze (ancient Near Eastern, not in the text) and a
  rolled rim; four spouts with plug taps; two ring handles. Its own mirror-polished bronze
  (Ex 38:8, the women's mirrors) with verdigris in recesses, mineral streaks under the spouts
  and a deposit line at the water level (1.8 cubits). Non-metallic water with shader ripples;
  slow drips (in the water mesh) onto a damp patch of sand.

## Tabernacle tent

- 2026-11-05: Boards sit in 1-cubit silver sockets (as tenons, per Rashi on 26:17), so the
  walls stay 10 cubits tall. The west wall is 6 boards plus 2 corner boards, covering the ends
  of the side walls.
- 2026-11-05: All 5 bars per wall are on the outside of the boards, held by gold rings. The
  top and bottom rows are two half-length bars each; the middle bar runs the full length.
- 2026-11-05: The door screen hangs from 6 gold hooks per side under the beam, split in the
  middle. (Superseded for the south half, see above.) Each half is gathered at the beam, cinched at 4 cubits (`doorTieHeight`) by a
  tasselled cord through a gold staple on the front board's inner face, and flares to the
  hem. `scene/drape.js` (`addGatheredDrape`) builds both these and the gate drapes. The beam
  uses plain GOLD so it merges into the tent's gold mesh.
- 2026-11-05: The door screen's embroidery is related to the gate's but distinct: two rows of
  sacred palms with lilies, an almond-blossom row (echoing Ex 25:33), rosette dividers and
  lotus-and-bud friezes. Nothing sits on the centre split.
- 2026-11-05: Goat-hair covering:
  - The side and back hems: see the slanted coverings below.
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
- 2026-11-05: The gathered door screen casts shadows. Exterior point lights reach 50% at the
  doorway, fading out over 2 m inside (`EXT_SPILL`), so the altar's shadowed light spills
  softly through the open door instead of stopping at a hard line.
- 2026-11-05: At the user's direction the coverings on the N, S and W sides are pulled out at a
  slant to stakes instead of hanging straight down. The goat-hair hem is 4.5 cubits out at
  1.5 high on the sides and 2.6 out at 0.8 high at the back, so roof plus two slants ≈ the
  30-cubit curtains (Ex 26:13). The goat hair hides the linen outside (Ex 26). Ram skins and
  tachash lie on it (offsets 0.12 and 0.24 cubit) and reach 64% and 32% of its slant, so goat
  hair, ram skins and tachash show as three stepped bands. At the front the ram skins droop
  0.7 cubit and the tachash has a 0.12 lip. Under the slants the outside of the boards and
  bars is visible.
- 2026-11-05: Each visible layer has its own row of bronze stakes and cords (Ex 35:18; 38:20),
  67 in all: 9.5 / 7.75 / 6.5 cubits out on the sides, 6 / 4.8 / 3.8 at the back, every
  4 cubits offset ±1.33 between layers; radial stakes at the back corners, diagonal ones at
  the front ends. Hems scallop between stakes. Stakes and cords merge into the bronze and rope
  meshes. Colliders (`tabernacle.js`) cover the footprint out to the goat-hair stakes.

## Interior furnishings

- 2026-11-05: Menorah (`scene/menorah.js`, `MENORAH` in dimensions.js) follows the Menachot 28b
  layout: 18 handbreadths (3 cubits) tall on a tripod base; semicircular arms centred on the
  shaft at 14.5 handbreadths (radii 6, 4, 2), leaving from knobs at 8.5, 10.5 and 12.5
  handbreadths. Cups are flared almond calyxes opening upward. Outer lamps face the centre; the
  middle lamp faces west, toward the veil (Menachot 98b). At x = −8, z = +2.5 cubits, branches
  E–W. One merged mesh, no shadow. Tongs and snuff dishes aren't modelled.
- 2026-11-05: Menorah ornament (reconstruction; the text gives cups, knobs and flowers,
  Ex 25:33–34; leaves at the user's direction): fluted almond cups whose calyx rises into
  5 pointed lobes; lobed knobs with neck fillets and bead rings; open 5-petal blossoms with
  stamen beads; small curled almond leaves, 6 under each knob (turned 30° on branch knobs to
  clear the arms) and 5 under each cup's calyx; beaded collars at the arm joints and below the
  top cups; a gadrooned, beaded base dome with a leaf ring on S-curved legs with paws on leaf
  feet. Layout and flame positions unchanged; one gold mesh, ~134k triangles.
- 2026-11-05: Table of showbread (`scene/showbread.js`): 2×1×1.5 cubits at x = −8, z = −2.5,
  long axis E–W. Frame 1 handbreadth wide, a crown on the top and a bead crown on the frame;
  rings on the legs of the long sides, poles E–W (closed gold cylinders, no acacia core).
  12 flat loaves in two stacks of six, each topped by a gold frankincense cup with resin.
  Gold dishes, bowl, jars and pan stand on the floor north of the table (no collider).
- 2026-11-05: Altar of incense (`scene/incenseAltar.js`): 1×1×2 cubits at x = −18.5, 1 cubit
  east of the veil. Horns in the bronze altar's shape scaled to 0.45 cubit; crown, plinth and
  bead are reconstruction. 2 rings per N and S side under the crown, poles E–W. A gold firepan
  with emissive coals (no light) and a faint smoke plume (`createIncenseSmoke` in fire.js):
  240 instanced puffs that drift outward in slowly turning directions and swell with height
  (spread 0.8, grow 8, 15 s cycle, opacity 0.12), a thin ribbon widening into a soft haze.
- 2026-11-05: Ark (`scene/ark.js`): 2.5 × 1.5 × 1.5 cubits including 0.14-cubit feet, at
  x = −25, z = 0, long axis N–S. Crown molding rises 0.04 cubit above the mercy seat, which is
  1 handbreadth thick (Sukkah 5a). Rings on the N and S faces at the feet; poles E–W from
  −28.4 to −21.6 cubits, clear of the veil.
- 2026-11-05: Cherubim: kneeling childlike figures (Sukkah 5b, Rashi on 25:18), about
  10 handbreadths to the wing tips, heads bowed, hands joined, wings raised and forward with
  tips nearly meeting over the center. The body is a signed-distance sculpture meshed at load
  with marching cubes (~120 ms); wings are three rows of feather blades plus two rows
  of coverts along the bone on both faces. Ark and cherubim are
  one gold mesh (1 draw).
- 2026-11-05: Ark ornament (`scene/arkOrnament.js`, at the user's direction; reconstruction —
  the text gives only the crown, Ex 25:11). Plant motifs only, no figures besides the
  cherubim. Profiled crown (bead, cove, band with bead-and-reel and leaf tips, roll, inner lip),
  same height and reach as before; molded plinth; framed recessed panels with beaded edges —
  long sides a central rosette with almond-leaf vines, palmettes and rosettes, short sides a
  central panel plus narrow palmette-column panels; corner pilasters; leaf-wrapped bun feet;
  scalloped rosette plates behind the rings. The mercy seat has a palmette-and-bud frieze with
  corner rosettes, left plain under the cherubim's feet. Real relief merged into the one gold
  mesh: ~205k triangles in all, ~26 ms to build, +0.26 ms at `holyofholies`.

## Fire & lighting

- 2026-11-05: The altar fire burns up through the grate; its base is 0.13 m below the grate
  top. The wood of the *ma'arakhah* is not rendered; `firewood.js` now only builds the coal
  bed (layers 0, leaners 0, 260 coals, glow 7).
- 2026-11-05: The altar PointLight is the only shadow caster: 0xff8a3a, 105 cd, decay 1.5,
  1.04 m above the rim, 1024 cube map, PCF radius 5. Decay 1.5 isn't physical; it lets the
  light reach the far side of the courtyard.
  - An unshadowed 14 cd fill light sits 3.0 m above the rim.
  - The altar bronze uses `shadowSide = DoubleSide`, which fixes a light leak along its base.
  - `addFireBounce` fakes firelight bouncing off the sand onto the altar's walls.
- 2026-11-05: There are 6 torches, positions in `TORCHES`. 4 have non-shadow 28 cd point
  lights; the 2 west outside corner torches only glow. With the menorah's light that makes
  7 point lights; the pillar of fire makes 8. (Removed: the pair flanking the gate at x 54,
  z ±12, and the pair outside the east corners at x 54, z ±28. Only the pair nearest the
  spawn, x 59, z ±7, stands outside the gate.)
  Torch fires have no smoke.
- 2026-11-05: Each torch is a 2.4 m wooden post in a stone cairn, with a charred,
  pitch-soaked cloth wrap on top and glowing HDR cracks.
- 2026-11-05: The menorah has one warm point light (0xffc080, 8 cd, decay 1.6, no shadow),
  0.3 m above and 0.35 m north of the lamps. Its 7 flames are one instanced emissive draw
  (`createLampFlames` in fire.js), not `createFire`, with a soft halo (`halo` 0.5).
- 2026-11-05: Incense coals are emissive 0xff5a14 at ~10 (pulsing) so they reach bloom's 2.0
  threshold. The smoke has no light.
- 2026-11-05: Interior light mask (`scene/interiorLight.js`, `applyInteriorMask(scene)` in
  main.js) patches every `MeshStandardMaterial`. A fragment pushed 0.3 m along its normal is
  tested against the tent's interior box. Point lights are classed inside/outside by position
  and only light fragments on their own side. Inside, the moon, hemisphere fill and env map
  are cut (30% cool spill in the first 1.5 m from the entrance) and replaced by a warm room
  ambient that flickers with the lamps and fades with distance from the menorah. West of the
  veil, menorah light and ambient drop to 8% (`uIlHoh`; `?light=work` sets it to 100%), and
  metal reflections there are boosted ×5 (`uIlHohGlint`) so the ark glints. Tuning uniforms:
  `__tabernacle.interior` (`uIlFalloff` 0.28, `uIlMetalDiffuse` 0.25, `uIlSpec` 5, `uIlLobe` 4,
  `uIlTint` 0.5, `uIlDirect` 0.7).
- 2026-11-05: A static reflection probe (256 px HalfFloat cube with mips) is captured once on
  the first frame from (−4.5, 1.8, 0) m with the interior shown; `__tabernacle.probe.capture()`
  re-captures it after interior changes. Gold east of the veil samples it, projected onto the
  Holy Place's walls, blurred by roughness (`uIlProbeLod` 5.5, `uIlProbeMix` 0.85,
  `uIlProbeGain` 1.15). The probe is unbound during capture (no feedback). No per-frame cost;
  capture takes ~60–200 ms warm.
- 2026-11-05: The ark has its own GOLD clone with an `IL_GLINT` term: a soft highlight from the
  menorah's glow over the veil (x = veil, y = 2.7 m; `uIlGlint` 14, pow 4, base 0.03),
  flickering with the room ambient. No light, so the Holy of Holies walls stay dark.
- 2026-11-05: Interior furnishing meshes and the veil cloth are hidden while the camera is
  outside the tent (`updateInteriorVisibility` in main.js), except that the veil, menorah,
  table and incense altar show whenever the camera is east of the tent front (x > 0), so the
  Holy Place can be seen through the open door; the ark shows only inside. Lights are never
  toggled. The veil
  pillars and hooks are part of the tent's gold mesh and stay drawn.
- 2026-11-05: Inside the tent, metals are burnished (roughness ≥ 0.45) and gold-hued metal is
  re-coloured to `uIlGold` (1, 0.7, 0.2 linear), keeping its texture detail; silver is left
  alone and exterior gold is unchanged. In r187 a metal's indirect reflectance is
  `material.diffuseColor` and the Lambert term is `diffuseContribution`; the patch sets both,
  plus `specularColorBlended` scaled by `uIlDirect`. The shared GOLD colour alone read brown.
- 2026-11-05: The gold board overlay has soft mottling and hammer dimples, no vertical streaks
  (they read as wood grain); per-board tint varies 0.96–1.02.
- 2026-11-05: The pillar of fire's light (`scene/pillarOfFire.js`): 0xffb35a, 90 cd, decay
  1.6, no shadow, ~13.5 m up in the fire's body (above the tent's interior box, so the mask
  classes it as outside), breathing ±10%. Raised with the fire, so 60 → 90 cd to keep the roof
  lit. The column's core is HDR (gain 2.6) and blooms; the thin shaft (gain 0.5) stays under
  bloom's threshold.
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
  - No moon (removed at the user's request). The cool "moon" directional light in
    lighting.js stays as night fill.
  - Star sizes are capped so none reads as oversized: largest layer rBase 0.034, gain 2.4; mid
    layer 0.040, 1.8 (the earlier 0.060/3.2 stars looked too big).
  - The horizon and everything below it use the fog color.
- 2026-11-05: The embroidered screens (`createEmbroideredScreenTextures` in textiles.js,
  design `gate`/`door`) are procedural canvas pairs: a colour map with satin, fishbone,
  couched and stem stitches, and a height map (linen weave plus raised stitching) used as
  the bump map at `bumpScale` 0.6. ~227 px/m, mipmaps, anisotropy 8, ~30–40 ms each at load.
- 2026-11-05: `createCherubimTexture` (textiles.js) draws the woven cherubim for both the
  ceiling and the veil: an ancient Near Eastern frontal figure (scale-covert band, straight
  primaries, fringed robe and shawl, squared hair with curls) in muted dyes local to the weave
  (indigo `#2e3a5c`, Tyrian purple `#55253f`, kermes scarlet `#93332b`) on unbleached linen
  `#d9cfb8`, drawn one pixel per 3-px thread and enlarged with a plain-weave thread texture.
  The ceiling (at the user's direction) uses `facing: 'center'`: one tile spans the full
  10-cubit width with 4 cherubim per row in profile, the two north ones facing south and the
  two south ones facing north, toward the tent's middle (cf. the mercy-seat cherubim facing
  one another, Ex 25:20). Facing pairs share their dyes. The profile figure
  (`drawCherubProfile`) strides forward, far wing raised up and back, near wing swept forward
  below the face (as on Phoenician/Egyptian winged guardians); frontal almond eye. The veil
  keeps the frontal figures.
- 2026-11-05: Garden ornament between the cherubim on the ceiling and veil (at the user's
  direction; after 1 Kings 6:29's "cherubim and palm trees and open flowers", 7:19's lily-work
  and the pomegranates of Ex 28:33), in the same three dyes on linen, drawn before the figures
  so they lie over any overlap. The ceiling has a sacred date palm (scaled trunk, arching
  fronds, volutes, date clusters) between each facing pair and lily-and-pomegranate stalks in
  the other gaps. The veil has a palm in each gap between its frontal figures. Both have
  small flowering sprigs along each row's ground line. `?light=work` adds an
  unshadowed 8 cd point light inside the tent at (−4.5, 1.8, 0) m.
- 2026-11-05: Materials:
  - `addMacroVariation` breaks up visible tiling.
  - The goat-hair texture tile spans 2 curtains × 4 cubits.
  - The skin textures tile every 8×8 cubits.
  - The tachash is dark brown leather.
- 2026-11-05: Gold patina (`addGoldPatina` in materials.js): one shared shader patch with 3D
  world-space noise (the 2D projected noise streaks): tarnish patches, grime near the floor,
  under overhangs and in concave creases (screen-space curvature), smudges at hand height
  (0.6–1.5 m) and fine roughness scratches; metalness stays ≥ 0.75. On GOLD and the ark's
  clone (`GOLD_PATINA`: scale 2, tarnish 0.18; `clone()` drops `onBeforeCompile`, so clones
  must be patched explicitly) and, gentler, on GOLD_OVERLAY so the walls don't blotch. Inside
  the tent the interior mask sets the hue, so the wear shows as darkening and roughness. No
  textures or extra draws; about +0.35 ms at `holyplace`.
- 2026-11-05: The pillar of fire is one analytic-volume draw: a flared bounding cylinder drawn
  back faces only, whose shader takes the ray's closest approach to the axis with a Gaussian
  density, wobbled by fire.js noise (`NOISE_GLSL`) and brighter with path length when looking
  along it (capped ×3). It gets half the scene fog (`uFogMix` 0.5) so the shaft stays visible
  from the courtyard, and a 4% multiplicative dither against banding.

## Camera & controls

- 2026-11-05: First person is the default. `?view=<preset>` switches to the free camera,
  except `walk`; `?cam=` always wins.
- 2026-11-04: The player has a 0.3 m radius and walks at 1.4 m/s (3.5 m/s running). The
  `walk` spawn is at z = 0, 15 cubits east of the open gate, facing west. The `sky` preset
  keeps the old spawn spot (z = +2.5 cubits).
- 2026-11-04: WASD works without pointer lock, because the in-app browser pane refuses
  pointer lock; mouse look still needs it.
- 2026-11-05: `PLAYER.lookSpeed` is 0.7. Head bob is vertical only and on by default.
- 2026-11-04: Gate screens and hangings people walk through don't collide; the gate pillars
  and the gathered middle drapes do. The tent door's tied-back north half has one 0.2 m circle collider
  (z = −2.11 m); the drawn south half doesn't collide; side and west walls and furnishings collide. The veil and its
  pillars don't (at the user's direction the player may walk into the Holy of Holies). Walking west on z = 0
  through the door stops at the incense altar's poles (x ≈ −7.64 m).
- 2026-11-04: The `top` preset uses a very high camera with a narrow field of view, close to
  orthographic, so proportions can be measured from screenshots.

## Performance baseline (2026-11-05, after opening the gate and door and adding the pillar of fire)

- Measured at a 2048×1536 canvas (1024×768 CSS at pixel ratio 2), post chain on. The GPU on
  this machine flips between a fast mode (`gate` ~0.3–0.8 ms per frame) and a throttled mode
  (~6–9 ms), sometimes mid-run; compare only like with like in one session.
- Step costs measured within that rule: the reflection probe +0.1–0.4 ms in interior views
  (one capture of ~60–200 ms at load), the open door +0.15 ms at `gate` (furnishings drawn
  through it), the pillar volume ≤0.04 ms except +0.4 ms at `firepillar`, the 12th light
  most of the rest (<1 ms throttled).
- Draw calls: `gate` 109, `iso` 113, `tent` 88, `firepillar` 98, `holyplace` 86,
  `holyofholies` 76. The Holy Place furnishings and veil now show whenever the camera is east
  of the tent front, which is why `gate` rose from 99.
