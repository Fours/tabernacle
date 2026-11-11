# The Tabernacle

A walkable, nighttime 3D reconstruction of the **Tabernacle (Mishkan) of Israel in the
wilderness**, built from the description in Exodus 25–27, 30 and 35–40. It runs in the browser
with Three.js, on desktop and on phones.

**Live demo: [tabernacle.kylewillett.com](https://tabernacle.kylewillett.com)**

You arrive outside the courtyard at night and walk in through the east gate. Inside are the bronze
altar with its fire, the laver, and the tent. Inside the tent are the menorah, the table of
showbread, the incense altar and, behind the veil, the ark. The camp of Israel lies around the
court, and the pillar of fire stands over the Holy of Holies.

## What's in it

- **The courtyard:** 59 pillars on bronze sockets with silver fillets and hooks. The linen hangings
  stir in the wind and glow where firelight passes through them. The gate's embroidered screen is
  tied back.
- **The bronze altar and its perpetual fire:** raymarched GPU flames with sparks, embers and smoke.
  Next to it are the laver and the ash heap.
- **The tent:** gold-covered boards, bars and sockets under four layers of coverings (linen,
  goat hair, rams' skins and tachash), staked and corded. The door screen is half drawn.
- **Inside:** the woven cherubim veil, the menorah with its seven lamps, the table of showbread,
  the incense altar with its thread of smoke, and the ark with its mercy seat and cherubim in the
  Holy of Holies. Warm haze, incense under the ceiling and dust in the lamplight fill the room.
- **Around it:** torches, the pillar of fire, sand with gentle relief and trodden paths, rocks and
  scrub, about 4,500 instanced tents laid out by tribe (Numbers 2–3), distant granite ridges and a
  starry sky with the Milky Way and meteors.
- **Sound:** positional fire for the altar, torches and pillar, a wind bed that follows the gusts
  moving the cloth, and night insects. All of it is muffled as you enter the tent.

## Accuracy

Accuracy to the text comes first. Every biblical measurement is kept in cubits
(`src/config/dimensions.js`) and converted at 1 cubit = 0.45 m.

- [`docs/SPEC.md`](docs/SPEC.md) collects what the text says about each object and the defaults
  used where it's silent.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) records the interpretive and technical choices made,
  and why.

## Controls

| Desktop | Phone / tablet |
|---|---|
| **W A S D** or arrow keys: walk | Left thumb: walk (push further to run) |
| **Mouse:** look around | Drag: look around |
| **Shift:** run | |
| **Esc:** release the mouse | Corner button: back to the title |
| **M:** sound on/off | Speaker button: sound on/off |

On a phone the view is always landscape and a lighter quality tier is used.

## Tech

- **Three.js r187** and **Vite**, plain JavaScript (ES modules), no UI framework.
- Almost everything is procedural: geometry, materials and textures (canvas and GLSL). The only
  external assets are CC0 sound recordings, listed in [`CREDITS.md`](CREDITS.md).
- Custom rendering: raymarched fire and light shafts, a replaced fog pipeline with ground haze
  and the fires' glow in the air, an interior light mask, baked contact AO, and a post chain with
  mip-chain bloom, GPU eye adaptation, colour grading and CAS sharpening.
- Performance: instancing and merged geometry keep the scene to roughly 80–145 draw calls. There
  is one shadow-casting light, and a separate quality tier for mobile.
- Web Audio: per-source PannerNodes, buses, and a muffle for the inside of the tent.

## Running locally

Requires Node 20.19 or later (for Vite 8).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run preview:lan` | Build and serve on the LAN (port 5181) for testing on a phone |
| `npm run lint` | ESLint |
| `npm run deploy` | Build and deploy to S3 + CloudFront (see [`DEPLOY.md`](DEPLOY.md)) |

Analytics (PostHog) is optional. To enable it, copy `.env.example` to `.env.local` and fill in
the key.

### Useful URL parameters

| Param | Effect |
|---|---|
| `?view=<preset>` | Free camera at a fixed view, e.g. `altar`, `tent`, `ark`, `camp`, `firepillar`, `sky` (full list in `src/camera/devCamera.js`) |
| `?light=work` | Bright neutral light so the geometry is readable |
| `?fps=1` | Frame time, fps and draw-call readout |
| `?debug=1` | Grid, axes and stats |
| `?fx=0` | Post-processing off |
| `?mobile=1` | Force mobile mode |
| `?quality=high\|mobile` | Force a quality tier |
| `?audio=0` | No sound |

[`AGENTS.md`](AGENTS.md) has the full list, plus the code map and conventions.

## Project layout

```
src/
  main.js        renderer, scene assembly, frame loop
  config/        biblical dimensions (in cubits) and quality tiers
  scene/         one module per object or system (courtyard, altar, fire, tent, ark, camp, sky…)
  camera/        first-person walking with collision, and a free camera with presets
  render/        post-processing, bloom, eye adaptation, atmosphere
  audio/         Web Audio engine, fires, wind, insects
  mobile/        forced-landscape viewport and touch controls
docs/            SPEC, DECISIONS, plans
```

## Credits

The sound recordings are CC0 recordings from Freesound. Their authors are credited in
[`CREDITS.md`](CREDITS.md).

## License

[MIT](LICENSE). The sound recordings keep their own CC0 terms (see Credits).
