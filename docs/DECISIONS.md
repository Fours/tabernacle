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
  clouds: a thin high haze (faint cirrus streaks ~152 m up over its axis, analytic in the sky
  shader) is lit warmly where the shaft ends.
- 2026-11-05: The tent door stands open too (same reason). Ex 26:37's 5 entrance pillars are
  left out; a gold-overlaid acacia beam between the front boards (underside at 9.5 cubits,
  0.5 × 0.5 cubit; not in the text) carries the screen.
- 2026-11-05: At the user's direction the door is now half closed: the south half (the
  player's left, seen from the courtyard) hangs drawn across to the middle of the doorway
  from hooks every ~0.32 m, with soft folds (`addHangingHalf` in `tabernacle.js`). The north
  half stays gathered and tied back. The drawn half has no collider, so the player can walk
  through it as well as through the open half.
- 2026-11-06: Blood on the mercy seat: read as the Day of Atonement's blood (Lev 16:14–15),
  dried on the lid. The text has it sprinkled "upon the mercy seat eastward, and before the
  mercy seat seven times"; the main splotch sits in the centre of the lid at the user's
  direction, with the drops and flecks round it thrown mostly east, the side it was sprinkled
  from.

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
- 2026-11-05: Showbread realism (reconstruction): each loaf has a seeded irregular outline, an
  uneven dome and a rounded rim, with planar UVs turned and mirrored per loaf. A procedural
  canvas crust (768 px tile over 0.36 m): golden-to-brown browning, pale patches, scorched and
  charred spots, blisters, cracks, docking pits and flour, plus a data map with bump (R) and
  roughness (G). Rim browning is in vertex colours; vertex alpha masks the crust off the
  frankincense. One material, one loaves mesh; ~80 ms at load.
- 2026-11-06: Table of showbread ornament (`scene/showbreadOrnament.js`, at the user's
  direction; reconstruction — the text gives only the crown round the top and the frame with
  its crown, Ex 25:24–25). The ark's vocabulary (plant motifs only, no figures) in the table's
  own layout: the top's crown a profiled moulding (astragal, cove, band with bead-and-reel and
  hanging leaf tips, roll, inner lip; same height, ~5 mm more outward reach for the relief);
  the frame's crown a rolled moulding along the frame's foot; on the frame's band (all four
  outer faces) a running almond scroll with rosettes from a central beaded rosette, beaded top
  and bottom edges, a rosette over each leg on the ends and a lobed rosette plate behind each
  ring; on each leg leaf collars under the frame (leaves hanging) and near the foot (leaves
  rising), an almond vine up every face, and a leaf-wrapped bun foot (replaces the plain cap,
  now 4.2 cm tall). Sizes, rings, poles, loaves, cups and utensils unchanged; still one gold
  mesh: +84.6k triangles, ~26 ms to build, +0.15 ms at `table`/`holyplace`. The long sides'
  band sits mostly behind the poles at eye height; it reads from above and from the ends.
- 2026-11-06: Worn, handled gold on the table (`tableGold` in `scene/showbread.js`; the
  reusable `addGoldWear` in `scene/metalWear.js`). The table's gold mesh (frame, cups, floor
  utensils) has its own `GOLD.clone()` with a heavier patina (tarnish 0.26) and a wear patch in
  the table's local frame: grime on the ground of the relief (on the frame band, leg faces and
  crown band, within ~3 mm of the block faces, so the raised scroll stays bright on a darker
  ground) and in the inner corners under the top and beside the legs (distance to boxes taken
  from SHOWBREAD, not screen-space AO, since box corners have no curvature to detect); crevice
  grime from curvature (beads, leaf ribs); dull, greyer, rougher fingerprint blotches on the
  pole ends and the top's end and long-side edges (carrying; changing the bread, Lev 24:8);
  fine dust thicker against the crown, a flour haze and crumb specks within ~7 cm of the two
  stacks; darker below 16 cm. Dust and crumbs drop the metalness below the interior mask's
  metal threshold so they read as matter, not darker gold. Other gold unchanged; no draws;
  +0.2 ms at `table` (A/B by swapping the material in one session).
- 2026-11-05: Altar of incense (`scene/incenseAltar.js`): 1×1×2 cubits at x = −18.5, 1 cubit
  east of the veil. Horns in the bronze altar's shape scaled to 0.45 cubit; crown, plinth and
  bead are reconstruction. 2 rings per N and S side under the crown, poles E–W. A gold firepan
  with emissive coals (no light) and a thin smoke thread (`createIncenseSmoke` in fire.js):
  8 ribbons × 110 segments in one draw, placed in the vertex shader. A laminar thread for the
  first 0.2 m, then sway with waves travelling up the flow, noise eddies and a slow drift; with
  height each ribbon peels off (up to 0.2 m), curls, twists (narrower and denser edge-on) and
  widens, and upward-scrolling streak noise breaks it into a faint haze by 1.3 m. Warm at the
  coals, grey-blue above, per-ribbon opacity 0.2, alpha-blended, no light.
- 2026-11-06: Altar of incense ornament (`scene/incenseOrnament.js`, at the user's direction;
  reconstruction — the text gives only the crown, Ex 30:3). The ark's vocabulary (plant motifs
  only, no figures) in the altar's own tall layout: the crown a profiled moulding (astragal,
  cove, band with bead-and-reel and hanging leaf tips, roll, inner lip; same height, ~4 mm more
  reach); a moulded plinth (roll, band of upright leaves and darts, cove; ~4.5 mm more reach,
  rising to 5.1 cm, replaces the plain footing box); on each side one tall framed panel with
  beaded edges holding an almond tree rising from a palmette base (two pairs of volute
  branches ending in rosettes, almond leaves and buds, a beaded rosette medallion at mid-height,
  a palmette at the top, small beaded rosettes in the field's corners); above it a frieze under
  the crown at ring height (a beaded rosette between two short almond scrolls; lobed rosette
  plates behind the rings on the north and south, beaded rosettes on the east and west); a
  bead-and-reel roll down each corner; a two-row calyx of almond leaves and a bead ring round
  each horn's foot. Size, horns, rings, poles, firepan, coals and smoke unchanged; the top
  inside the crown stays plain. Each face's relief is built once and copied to the four faces.
  Still one gold mesh: +94k triangles, about half the table ornament's build time (~12 ms),
  +0.23 ms at `incense`. `incenseGroundBoxes()` exports the relief's ground blocks (body,
  crown band, plinth band) for the wear patch.
- 2026-11-06: Worn, sooted gold on the altar of incense (`altarGold` in
  `scene/incenseAltar.js`; `addGoldWear` in `scene/metalWear.js`). The altar's gold mesh has its
  own `GOLD.clone()` (patina re-applied, tarnish 0.2) with a wear patch in the altar's local
  frame, for an altar burned on twice a day (Ex 30:7-8): soot and resin from the firepan's
  centre (radius 16-40 cm, from 14 cm below the top up), mottled by streak noise, strongest on
  the top and on faces turned toward the coals (the crown's inner lip, the horns' inner sides;
  outer walls get 30% of it), its lower edge wandering ~12 cm so it runs down the sides in
  tongues; grime on the ground of the relief (`incenseGroundBoxes`: panel fields, frieze,
  crown and plinth bands, kept light so the relief stays bright against it) and in the inner
  corners; dull, greyer fingerprint blotches on the pole ends and the crown's edge; grey ash
  (new `dust.color`) on the top round the pan; darker below 10 cm. `addGoldWear`'s soot gained
  `streak` and `inner` and is applied before the dust (ash settles on soot); the table does not
  use soot and its shader is unchanged. Soot and ash lower the metalness below the interior
  mask's threshold so they read as matter. Other gold unchanged; no draws; +0.25 ms at `incense`.
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
- 2026-11-05: Ark ornament (`scene/arkOrnament.js`, helpers shared in `scene/ornament.js` since
  2026-11-06; at the user's direction; reconstruction —
  the text gives only the crown, Ex 25:11). Plant motifs only, no figures besides the
  cherubim. Profiled crown (bead, cove, band with bead-and-reel and leaf tips, roll, inner lip),
  same height and reach as before; molded plinth; framed recessed panels with beaded edges —
  long sides a central rosette with almond-leaf vines, palmettes and rosettes, short sides a
  central panel plus narrow palmette-column panels; corner pilasters; leaf-wrapped bun feet;
  scalloped rosette plates behind the rings. The mercy seat has a palmette-and-bud frieze with
  corner rosettes, left plain under the cherubim's feet. Real relief merged into the one gold
  mesh: ~205k triangles in all, ~26 ms to build, +0.26 ms at `holyofholies`.
- 2026-11-06: Blood on the mercy seat (`addMercySeatBlood` in `scene/ark.js`; see
  "Interpretation of the text"): a mask in the ark's own gold material, object space, no texture
  or draw. Only fragments facing up (n.y > 0.8) within 1.5 mm of the lid's top and inside its
  plain field (|x| < 0.24, |z| < 0.27 m) are tested, so the cherubim, frieze and crown stay
  clean. A ~22 cm noise-warped, lobed splotch with a run to the east, plus 22 seeded round
  drops (3 mm–2 cm) and 6 radial flecks, about two thirds of them east. Dried red-brown,
  darker where thick and at a dried rim, glossier (roughness 0.32) where thick. Metalness
  0.4–0.48: under the interior mask's metal threshold (0.5) so it isn't re-coloured as gold,
  but not 0, because the Holy of Holies is lit almost only through reflections and a plain
  dielectric read as a black hole. +0.07 ms at `holyofholies`; preset `mercyseat`.

## Fire & lighting

- 2026-11-05: The altar fire burns up through the grate; its base is 0.13 m below the grate
  top. The wood of the *ma'arakhah* is not rendered; `firewood.js` now only builds the coal
  bed (layers 0, leaners 0, 260 coals, glow 7).
- 2026-11-05: Altar and torch flames are a raymarched volume (`fireVolume.js`, one draw per
  fire), replacing the camera-facing flame sheets (they read as flat cut-outs with scrolling
  noise). A cylinder round the bed (radius 1.45 × the flames' base radius, `flameSize` / 2,
  plus half the wind lean; 1.4 × flame height tall) is drawn front faces out (back faces when
  the camera is inside); the ray is clipped to it analytically and marched in up to 56 steps
  (interleaved-gradient jitter), skipping the noise outside the flame's envelope and stopping
  at 98% opacity. Level of detail by the flame's projected height (px, per draw): the step is
  clamp(3 / px, 0.025, 0.15) flame heights (full quality from ~120 px up), and the warp and fine
  noise fade out between 30 and 10 px, so a far torch costs a few samples and doesn't shimmer.
  On near-vertical rays (|d.y| 0.4–0.9) the core stop is damped up to 45% and the temperature
  up to 12%, so from straight above (`altartop`) the hearth reads orange-yellow instead of a
  pale-yellow mass. The field is fuel-driven: heat highest over the middle
  of the bed, falling with height and eroded more and more by noise as it rises, so a
  continuous body splits into tongues whose tips pinch off into flamelets that burn out. The
  noise (the tiling 64³ texture shared with the pillar of fire) is advected in a buoyant frame
  (sampled at sqrt(height) − time), so features rise slowly at the bed, accelerate and stretch
  upward; fine, fast turbulence low, larger, slower tongues higher; a slow domain warp bends
  them, the flame leans with the per-fire wind and its height and heat follow the same `level`
  as the light's flicker. Emission and absorption both follow density (premultiplied out), so
  thick flame settles on the shared ramp colour (yellow-orange body, HDR yellow core blooms,
  orange-red tips) and edges stay translucent. Everything is in units of the flame height, so
  a torch looks like a small altar fire. The altar's grate bars (`hearth.grate`) are
  intersected analytically and end the ray, so they cut the flames' bases (which still start
  0.13 m under the grate). Cost: ~+1.2 ms at `fire`, ~+0.3 ms at `gate` (throttled mode, flame
  meshes on/off in one session); draws unchanged. `createFire`'s `flames` option now only
  reserves its old 4 × flames random draws, so the particles keep their seeds.
- 2026-11-05: Torch flames: radius 0.08, height 0.5, base 0.03 m below the post top so they
  wrap the burning crown; light offset 0.35 (same height as before). Flame-only options
  (`createFire` → `createFlames`; the particles don't read them): `flameSize` 0.24 (base radius
  0.12, hugging the ~0.085 m crown), `flameSolid` [0.075, 0.07] (a solid cylinder for the
  crown ends the rays, so flames behind the head don't draw over it), `flameSpeed` 1.7 (a
  small flame flickers faster), `flameRagged` 1.6 (more erosion: torn tongues and flamelets),
  `flameThickness` 0.7 (optically thinner, more translucent), `flameLean` 4 (the flame leans
  ~4× the particles' wind drift, gusting ±40% on its own slow noise). Each torch has its own
  seed (100 + i), so time offset, noise offset and gust phase differ. The light's flicker and
  the flame share `level`: it drives the light intensity, the flame brightness, its height
  (±16%) and heat. The coal
  bed's glow follows the flame `level` (0.75 + 0.25·noise + 0.4·level).
- 2026-11-05: Fire particles (`fireParticles.js`): each fire draws its sparks, embers, ash and
  smoke in one instanced draw with premultiplied blending. Sparks and embers write alpha 0
  (additive, order-free); smoke and ash composite normally. Instances draw in a fixed order
  (smoke, ash, embers, sparks), unsorted, so nothing pops. A fire is 2 draws: flame volume plus
  particles.
- 2026-11-05: Sparks are motion-blur streaks: a capsule between the analytic path now and
  28 ms earlier (45 ms embers, 80 ms ash), at least ~1.2 px wide with brightness scaled to keep
  the energy. They cool pale yellow → orange → red and wink out at their own age; about a
  third fly in small bursts. The altar has 90 sparks, 24 embers and 50 ash flecks.
- 2026-11-05: Altar smoke: 56 soft puffs (circular falloff × rotating noise) rising ~6 m from
  0.75 × flame height, dissolving by ~7 m, lit warm by the fire (1/(1+d²) falloff, wrapped
  sphere normal) with darker dense cores over a cool grey-blue ambient (0.04, 0.05, 0.07). No
  soft-particle depth fade (no depth texture); the puffs start above the rim instead.
- 2026-11-05: The flame ramp's yellow-white core stop is (2.2, 1.25, 0.36) × core, so the lower
  centre isn't hot-white.
- 2026-11-05: Dust motes (`scene/dustMotes.js`) drift in the firelight round the altar (700),
  each lit torch (120) and the menorah (220, inside the tent lit only by the menorah, outside
  only by the fires): one instanced additive draw, lit by I/d² from the atmosphere's glow
  sources, faded beyond 16 m. The altar smoke thickens only over the first 30% of a puff's life
  — now the first 15% (`smokeFadeIn` 0.15; torches keep 0.3) at opacity 0.26, fire glow 1.4 — a faint plume just above the flames, not an opaque ball.
- 2026-11-05: The altar PointLight is the only shadow caster: 0xff8a3a, 105 cd, decay 1.5,
  1.04 m above the rim, 1024 cube map, PCF radius 5. Decay 1.5 isn't physical; it lets the
  light reach the far side of the courtyard.
  - An unshadowed 14 cd fill light sits 3.0 m above the rim.
  - The altar bronze uses `shadowSide = DoubleSide`, which fixes a light leak along its base.
  - Shadow `bias` 0 (was −0.002), `normalBias` 0.03. The light grazes the ground, and the
    negative bias let it leak past the base of the court's hangings as a lit band with a hard
    edge ~1 m outside the walls.
  - `addFireBounce` fakes firelight bouncing off the sand onto the altar's walls.
- 2026-11-05: There are 6 torches, positions in `TORCHES`. 4 have non-shadow 28 cd point
  lights; the 2 west outside corner torches only glow. With the menorah's light that makes
  7 point lights; the pillar of fire makes 8. (Removed: the pair flanking the gate at x 54,
  z ±12, and the pair outside the east corners at x 54, z ±28. Only the pair nearest the
  spawn, x 59, z ±7, stands outside the gate.)
  Each torch fire has 8 sparks, 2 embers and a thin dark wisp (16 small puffs, 1.6 m high).
- 2026-11-05: Each torch is a 2.4 m wooden post in a stone cairn, with a charred,
  pitch-soaked cloth wrap on top and glowing HDR cracks.
- 2026-11-05: The menorah has one warm point light (0xffc080, 8 cd, decay 1.6, no shadow),
  0.3 m above and 0.35 m north of the lamps. Its 7 flames are one instanced emissive draw
  (`createLampFlames` in fire.js), not `createFire`, with a soft halo (`halo` 0.5).
- 2026-11-05: Incense coals are emissive 0xff5a14 at ~10 (pulsing) so they reach bloom's
  threshold (now a soft gate from 1.5 to 2.5; all listed emissives still bloom, the pillar
  shaft at gain 0.5 stays under it). The smoke has no light.
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
  re-captures it after interior changes. The probe sample is not multiplied by the gold tint
  (`ilTint`): it already sees the gold room, and tinting again turned shadowed gold coppery. Gold east of the veil samples it, projected onto the
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
  lit. The column's core is HDR (ramp up to ~2.2) and blooms; the thin shaft (gain 0.5) stays under
  bloom's threshold.
- 2026-11-05: The night fill is a hemisphere light at 0.22 plus a moon directional light at
  0.16 from (−40, 80, 30).

## World

- 2026-11-05: Ground scatter (`scene/groundScatter.js`, 4 instanced draws): the wilderness is
  read as stony steppe. Seeded clumps of flint and limestone stones (3–25 cm, each shaped in
  the vertex shader), dry grass tufts and blades, broom and wormwood shrubs (25–65 cm) with a
  gentle wind sway. Density by distance from the court: full within 15 m, 0.3 at 45 m, 0.04 at
  90 m, none past 170 m; pebbles and blades only within ~40 m; far rocks use a 20-triangle
  mesh; blades and twigs halve past ~35–40 m from the camera. The court is covered like
  the ground outside it (2026-11-05, at the user's request: no bare ground anywhere the player
  walks; tune down if too dense). The gate approach and the camp's lanes are scattered like
  the rest of the ground, only clear of tents (a bare lane read as a lighter strip of
  different ground). Kept clear: 0.5 m inside the pillar line out to a 3.7-cubit peg band
  outside it, 1.5 m around the torches, inside every collider, the whole tent footprint (floor
  included, out to its stakes) and the altar's utensils (`userData.groundKeepOut`, cleared in
  `main.js`). No colliders; receives shadows, casts none. `userData.removeWhere` lets later
  modules clear scatter (the camp).
  About +0.6–0.7 ms at `gate`.
- 2026-11-05: Ground relief (`scene/terrain.js`): gentle warped-sine dunes, ~12 cm rms and at
  most ~0.5 m, starting 10 m outside the hangings and full by 40 m, kept to 30% along the
  camp's lanes, the gate approach and the streets; the court is level (y = 0). The mesh is
  baked on a graded grid (4/8/28 m cells). `groundHeight(x, z)` is that mesh's exact
  interpolation; everything standing outside the court uses it (scatter, tent instance y at the
  lowest ground under the cloth, torches, the 1.6 m eye). Vertex-shader displacement was
  rejected (~1.4 ms at `camp`).
- 2026-11-05: Trodden ground: the priests' round (gate → altar → laver → tent door) and rings
  round the altar and laver are darker, compacted and ripple-free, with faint footprints, and
  the scatter is cleared off them (`isTrodden`). The night sand albedo is desaturated toward a
  cool grey-beige; the firelight supplies the warmth. Quartz grain glints: one world-anchored
  facet per 7 mm cell, faded before a cell gets smaller than a pixel.
- 2026-11-05: Away from the court the plain is darker: the sand's albedo falls to (0.32, 0.29,
  0.25) of itself (a touch warmer) from 4 m to 40 m outside the court's rectangle. From above
  the camp the moonlit sand read pale, almost snowy, against the near-black tents; now the camp
  sits on a dark plain and the court's firelight is the bright focus. Eye-height views
  (`gate`, `corner`, `campwalk`, `ground`) change by under 1% (`horizon` −8%, before eye
  adaptation). The multiplier is a uniform (`material.userData.far`).
- 2026-11-05: Distant granite ridges close the horizon (the wilderness of Sinai, Num 1:1; a
  reconstruction), `scene/horizon.js`. They are composited in the sky shader with no draw of
  their own, so they follow the camera and never meet the ground or the camp. Three layers at
  3.6, 6.5 and 11 km, heights 35–170, 110–400 and 260–880 m (~1–5° above the horizon), tested
  against (H − camera height)/D so they sink from high views. Ridged noise on a circle gives
  massifs, saddles and foothills with angular crests; tones 0.27/0.42/0.64 × the horizon colour
  (near to far), each dissolving into it toward its foot; faint moon-fill, a cool crest rim and
  a trace of the pillar's light on the nearest layer.
- 2026-11-05: Camp of Israel (`scene/camp.js`, 6 instanced draws, ~4,500 tents, no lights).
  Bands are measured from the court rectangle. Levites in rows facing the court at 10–30 m:
  Moses, Aaron and the priests east, Gershon west, Kohath south, Merari north (Num 3:23–38).
  Tribal camps from 36 m out to ±286 m: Judah east, Reuben south, Ephraim west, Dan north
  (Num 2), three tribes each side by side split by straight lanes at ±95 m, the leader's tribe
  in the middle (our choice; the text gives no order within a camp). Density follows the
  Num 2 census a little. Diagonal lanes from the court corners, cross streets at 105/170/235 m,
  the east approach (|z| < 7 m) open to the edge. Tribes are 24 m family clusters of tent rows,
  noise-thinned. Variants: small ridge tent, goat-hair tent with a propped front flap,
  multi-pole family tent with walls partly down; near LOD within 60 m of the court, coarse
  beyond. Goat-hair or undyed cloth colours per instance. No shadows cast; near tents receive.
  Every tent collides via one spatial-grid collider (`colliders.js`). Scatter is cleared under
  tents. `camp` sits 58 m up because the fog hides the camp from higher.

## Rendering

- 2026-11-05: Tone mapping is ACES Filmic, exposure 1.1, sRGB output — AgX washed out the
  firelight.
- 2026-11-05: Post chain (`render/postfx.js`), in order: 1. MSAA half-float render.
  2. Mip-chain bloom (`render/bloom.js`): 13-tap prefilter with a Karis average against
  fireflies, a soft-knee gate (smoothstep 1.5–2.5) that passes the whole colour like
  UnrealBloomPass's high-pass, then 7 down/up levels (13-tap down, 3×3 tent up, scatter 0.7),
  strength 1.8. It replaced UnrealBloomPass, whose fixed-weight Gaussian levels gave a halo
  ring around small hot sources. 3. Eye adaptation (`render/exposure.js`), all on the GPU:
  64×32 log luminance, then a 1×1 ping-pong pass. 4. Grade (`render/grade.js`, linear HDR):
  heat shimmer, edge chromatic aberration 0.0016 (faded in on r², smoothstep 0.06–0.5, so the frame centre and gold bevels stay clean), bloom, procedural lens dirt lit only by the
  widest bloom level, adapted exposure, warm highlights (0.06), saturation roll-off in the
  brights (0.18), cool split tone in the darks, vignette, grain. 5. OutputPass (ACES, exposure
  1.1, sRGB). 6. Finish (display-referred): S-curve (exponent 1.12 around 0.4), cool black lift
  (0.008, 0.011, 0.02), CAS sharpening 0.35. `?ae=0` holds the exposure at 1; `?lens=0` turns
  off aberration, dirt and sharpening.
- 2026-11-05: Eye adaptation target = (−4.4 − log2 L) × 0.3 + key, in stops, eased with tau
  1.5 s rising / 1.0 s falling. Outside the tent: key 0, clamp −0.25…+0.2 stops. Inside (the
  camera-inside test in main.js): key +0.35, clamp −0.2…+0.3. The lamplit Holy Place measures
  about as bright as the firelit court (log2 L −4.06 vs −4.4 at `gate`), so luminance alone
  would lower the exposure inside; the key makes the eye open up after stepping in, while the
  clamp keeps the Holy of Holies dark (×1.23 at most) and the court from washing out.
- 2026-11-05: Night haze is `FogExp2(0x0b0f1c, 0.012)` plus, through replaced fog chunks
  (`render/atmosphere.js`), a ground-hugging haze (0.05/m at the ground, falling off 1.3/m
  with height, drifting noise, colour fog × 3.5, dimmed to 25% (`uAtmoHazeDown`) on steep downward rays: the mist is lit from above, so looking down it is back-scattered and dim) and the glow of the fires in the air:
  closed-form point-source in-scattering along each view ray for the altar, the six torches
  and the pillar of fire (base air 0.003/m plus local haze, Henyey-Greenstein g 0.6, per-source
  reach 8 / 3 / 25 m, gains 0.5 / 0.5 / 0.8 of each light's candela; without the reach the 1/h
  tails turned the sky brown). The tent's interior box is cut out of every ray. Additive
  sprites fade to black by the same fog amount; smoke uses the full fog. The sky dome applies
  the same haze and glows (`atmoSky`), so the horizon closes in the haze colour. `?haze=0`
  gives plain FogExp2.
- 2026-11-05: The tent has its own air (`atmoInterior` in `render/atmosphere.js`), applied to
  the part of each view ray inside the interior box (the part cut out of the outside haze), so
  rays from outside through the door and the sky seen from inside pick it up with no seam:
  - Room haze 0.012/m in the room ambient's colour × 0.6 (warm, flickering with the lamps).
  - The menorah's glow: the seven lamps as one source at their centroid (core 0.3 m, reach
    3.5 m, the menorah light's 8 cd × 1), scattering 0.022/m, Henyey-Greenstein g 0.35 (smoke
    and dust scatter more broadly than the night air), same closed form as the fires' glows,
    over the part of the ray east of the veil only. It has its own uniforms, not one of the 8
    outside glow slots (all used).
  - Incense under the ceiling: a layer in the top 0.8 m whose density ramps linearly to
    0.25/m at the ceiling (closed-form optical depth), × 0.35 near the door rising to × 1 by
    the incense altar and veil, × slowly drifting noise; colour room ambient × 2.5, so it reads
    as faintly lit smoke along the ceiling's far end without veiling the woven ceiling.
  - West of the veil: haze at 15% density and 10% brightness, no menorah glow; the ark's glint
    is untouched.
  - Cost +0.2 ms at `gate`, +0.35 ms at `holyplace` (throttled), no draws.
- 2026-11-05: Above 80 m the fog density falls with the square of the camera's height (the night
  fog is ground air). Only `top` (270 m) is that high; at 0.012 for 270 m the FogExp2 was
  ~100% and the plan view showed only the pillar of fire's head on black. `camp` (58 m) and
  everything below are unchanged.
- 2026-11-05: The night environment is generated in `render/environment.js` (intensity 0.35):
  cool sky with a warm band at the horizon, so metals pick up warm reflections.
- 2026-11-05: No screen-space AO (GTAO would need a second scene render, ~85 more draws, and
  clashes with the transparent fire sprites). Instead, AO without a screen pass (`scene/ao.js`,
  0 extra draws, ~+0.15 ms):
  - Ground contact AO: modules list their footprints as `userData.aoShapes` (circles, boxes,
    segments with falloff and strength); `main.js` bakes them once into a 4 cm R8 texture over
    the court (~15 ms at load), sampled by the sand shader.
  - Global terms in the interior mask patch: surfaces near the ground and not facing up darken
    (over 0.45 m); inside the tent the side walls, west wall, ceiling and veil darken the
    surfaces facing them (over 1.1 m), so wall bases, seams and corners darken.
  - Crease AO from a few analytic boxes (`addBoxAO`): the altar's ledge and body, the courtyard
    pillars' socket, shaft foot and capital flare (local space, own material copies), the ark's
    crown. Menorah joints rely on the gold patina's crease term.
  - All terms scale indirect light fully and direct light by `uAoDirect` (0.7), so the altar's
    real shadow isn't doubled. `?ao=0` turns AO off; `window.__tabernacle.ao` holds the
    uniforms.
- 2026-11-05: The sky is a dome that follows the camera (`scene/sky.js`, 1 draw call):
  - Stars are drawn in anti-aliased hashed cells, 5 layers.
  - Milky Way with dust lanes.
  - Slow twinkle.
  - No moon (removed at the user's request). The cool "moon" directional light in
    lighting.js stays as night fill.
  - Star sizes are capped so none reads as oversized: largest layer rBase 0.034, gain 2.4; mid
    layer 0.040, 1.8 (the earlier 0.060/3.2 stars looked too big).
  - The horizon and everything below it use the fog color.
  - Drawn after the opaque meshes (renderOrder 1000) with a depth test, so its shader only runs
    where the sky shows (otherwise ~+3 ms at `gate`).
  - Airglow: a faint green-olive band peaking ~8° up. Milky Way: warm bulge, the Great Rift and
    fine dust lanes, cool-to-warm drift, faint pink patches.
  - Meteors: one per 30 s slot, starting at k·30 + fract(k·0.618034)·12 s, 0.8 s, faint;
    `?skyt=<s>` pins the sky clock (e.g. `?view=sky&skyt=340.03`).
  - Below the horizon `atmoSky` stops the haze where the ray would meet the flat desert, so the
    sky beyond the 300 m ground mesh matches the fogged far ground.
  - The finish pass adds a ±1 LSB static dither against banding.
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
- 2026-11-05: Cloth (`scene/cloth.js`): textiles carry a shared patch. Firelight shows
  through cloth by a diffuse transmission term per point light (wrapped −N·L with a forward
  lobe, tinted by the cloth's colour, unshadowed but distance-attenuated; the back-lighting factor cubed ×1.4 so folds facing the light glow and valleys darken, an extra (10 m/d)^0.7 falloff capped at 1.5, and the albedo's variation counted twice so denser weave and the dusty hem pass less light), classed by the
  interior mask from the cloth's back side, so the menorah only shines through cloth whose back
  faces the tent and the altar and torches only through cloth facing out. Strengths: linen
  hangings 0.35, gate and door screens 0.3, veil 0.2, goat hair 0.04, skins and the linen
  ceiling none. A Charlie fibre sheen (direct, after the shadow) and a grazing rim (indirect)
  tinted by sqrt(albedo) on linen and wool; none on skins.
- 2026-11-05: Wind: a slow travelling-wave field (shared `WIND` uniforms, from the north-west)
  displaces cloth in the vertex shader along per-vertex directions and amplitudes
  (`aWind`/`aWindG`), with analytically bent normals and matching shadow materials. Hangings
  and gate panels 4.5 cm (sin·sin profile, zero at hooks, pillars and the pegged hem; 10 rows,
  existing top sag kept), gate drape hems 3 cm below the tie, the door's drawn half 3.5 cm,
  its tied-back hem 2.5 cm, coverings' hems 1.4 cm. The veil is still. `?wind=0` stills it.
- 2026-11-05: Materials:
  - `addMacroVariation` breaks up visible tiling.
  - The goat-hair texture tile spans 2 curtains × 4 cubits.
  - The skin textures tile every 8×8 cubits.
  - The tachash is dark brown leather.
- 2026-11-05: Metal and wood wear (`scene/metalWear.js`), procedural in world/object space,
  no textures or draws. Bronze is hammered with edge wear and verdigris; the altar is sooted on
  its upper walls and horns. Silver is tarnished in hollows and polished on high spots. Acacia
  has grain and checks. The board gold has bevels, joints, sheet overlaps every 1.35 m with
  nails, a hammered surface and 1.2× reflectance, so the interior mask's gold re-colouring reads
  as beaten gold, not brown wood. Clones are re-patched where they are made.
- 2026-11-05: Gold patina (`addGoldPatina` in materials.js): one shared shader patch with 3D
  world-space noise (the 2D projected noise streaks): tarnish patches, grime near the floor,
  under overhangs and in concave creases (screen-space curvature), smudges at hand height
  (0.6–1.5 m) and fine roughness scratches; metalness stays ≥ 0.75. On GOLD and the ark's
  clone (`GOLD_PATINA`: scale 2, tarnish 0.18; `clone()` drops `onBeforeCompile`, so clones
  must be patched explicitly) and, gentler, on GOLD_OVERLAY so the walls don't blotch. Inside
  the tent the interior mask sets the hue, so the wear shows as darkening and roughness. No
  textures or extra draws; about +0.35 ms at `holyplace`.
- 2026-11-05: The pillar of fire is two draws: a raymarched volume and an embers swirl. A
  flared bounding cylinder (back faces only) marches the column inside an envelope×1.15 +
  1.0 m + 0.4 m cylinder, in steps of ~2.5 px (0.1–0.5 m by distance, at most 96), jittered
  with time-stable interleaved gradient noise; samples beyond the tongues' reach leap 0.75×
  the gap toward it, and the march stops at 97% opacity. Revised the same day (fire plan
  Step 4): the column is a towering mass of altar-sized flames rather than a few giant
  billows. It uses the altar's flame language (`FLAME_GLSL` in `fireCommon.js`: buoyant
  frame, warp, fine noise, tongue cells, heat → density/temperature), with a 5 m flame height
  (tongue cells ~0.36 m across, 1.5–2 m tall). Its "bed" is a slowly rolling surface at 70%
  of the envelope (±10%); heat = 0.2 + 0.5 × depth (depth in 0.7 m units, a quarter of that
  at the point, capped) + noise, eroded more toward and beyond the rim, so the body stays
  coherent and hot inside while its surface breaks into tongues licking up the rim, with
  fine fast turbulence at the foot (the buoyant frame is sqrt over the lowest flame height,
  then linear: tongues rise ~3 m/s). Two tongue layers with staggered life cycles (phase
  0.45/s, varying over the column, reseeded at zero weight, variance-renormalised) make
  tongues form, break up and burn out instead of scrolling; a slow twist (0.06 rad/m) keeps
  the 2 m noise tile from lining up. Emission 0.8/m and absorption 2.2/m both follow
  density, as in the altar, so the flame settles on its ramp colour and edges stay
  translucent (it dims the sky behind by up to 35%). The envelope tapers to a soft point
  over the lowest 4.5 m, then narrows linearly to 45% at the top; brightness per metre is
  divided by that narrowing, then falls to 35% from 40% to 100% of the height; density fades
  from 50% to 102%, absorption to 30% and the colour drifts 70% toward the shaft's yellow, so
  it hands over to the shaft with no neck. The warp and fine noise fade out as a flame height
  drops from 45 to 15 px. The shaft stays analytic (closest approach, Gaussian across, slow
  ripple, gain 0.5, capped ×3 along the path) and fades in from half the column's height.
  Both get half the scene fog (`uFogMix` 0.5) and a 4% dither. 480 small embers
  (0.025–0.06 m, a tenth up to 0.11 m, with per-ember radius, spin and drift variety) spiral
  up around the column in one instanced draw. Cost of the altar-like flames (throttled,
  same-session A/B): +0.7 ms at `firepillarfoot` (7.27 → 7.97), +0.3 ms at `firepillar`
  (10.27 → 10.56), draws unchanged.

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

## Performance baseline (2026-11-05, after the fire plan)

- Measured at a 2048×1536 canvas (1024×768 CSS at pixel ratio 2), post chain on, as AGENTS.md
  describes (5 warm-up renders, then 40 `fx.render()` calls closed by a 1-pixel `readPixels`;
  the better of two runs, which agreed to 0.1 ms). The GPU on this machine flips between a fast
  mode (`gate` well under 1 ms) and a throttled mode, sometimes mid-run; compare only like with
  like in one session. These numbers are the throttled mode.

  | Preset | Draws | ms |
  |---|---|---|
  | `gate` | 122 | 12.2 |
  | `iso` | 122 | 12.5 |
  | `tent` | 106 | 10.6 |
  | `firepillar` | 115 | 10.6 |
  | `firepillarfoot` | 92 | 8.0 |
  | `holyplace` | 104 | 10.2 |
  | `holyofholies` | 90 | 9.6 |
  | `camp` | 122 | 11.4 |
  | `campwalk` | 82 | 9.5 |
  | `horizon` | 78 | 9.1 |
  | `fire` | 111 | 11.1 |
  | `fireclose` | 108 | 10.8 |
  | `torch` | 117 | 11.5 |

- The fire plan's cost (same-session A/B in throttled mode): Step 1 raymarched altar flames
  ~+1.2 ms at `fire`, ~+0.3 ms at `gate`; Step 2 torch flames ~0 (level of detail by projected
  height); Step 3 pillar embers ~0; Step 4 pillar column +0.7 ms at `firepillarfoot`, +0.3 ms at
  `firepillar`. Draws unchanged throughout. The totals above match the previous baseline's draws
  and are within ~0.2 ms of its times (the other presets drifted slightly down, so the rows are
  not a clean A/B).
- Against the AAA polish plan's budget (`gate` under ~14 ms throttled): met. Before that plan (the earlier
  baseline) `gate` drew 116 (+6 over the plan, within its ~6 per step), `iso` 116 (+6), `tent`
  99 (+7), `firepillar` 109 (+6), `holyplace` 97 (+7), `holyofholies` 86 (+4), `camp` 116 (+6),
  `campwalk` 77 (+5).
- Per-step costs (throttled, A/B in one session): Step 5 atmosphere +2.3 ms at `gate` on an
  ~18 ms baseline of that session (glow loop ~0.4, haze noise ~0.4) and +1 draw (dust); Steps
  1–4 together ~+0.5 ms and +2 draws; Step 8 `gate` +0.14, `camp` +0.60, `holyplace` +0.26 ms;
  Step 10 interior air +0.2 ms at `gate`, +0.35 ms at `holyplace`, no draws.
- Earlier: the reflection probe +0.1–0.4 ms in interior views (one capture of ~60–200 ms at
  load), the open door +0.15 ms at `gate`, the camp +0.1 ms at `gate` and +0.2–0.3 ms at
  `camp` (~4,500 tents, ~119k triangles, ~11 ms to build plus ~12 ms to clear the scatter
  under it at load). The camp's 6 instanced draws are in every view.
