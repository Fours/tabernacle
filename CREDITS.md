# Credits

Third-party assets used in this project. Everything below is released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication), so no
attribution is required; it is given here as thanks. All processing (trimming, looping, filtering,
loudness, AAC encoding) was done with ffmpeg; the processed files are in `public/assets/audio/`.

## Audio (Freesound, CC0 1.0)

| File | Source recording | Author | Licence | What was done |
|---|---|---|---|---|
| `altar-fire.m4a` | ["fire ambience, flames, crackles, pops"](https://freesound.org/people/ahriik/sounds/508110/) | ahriik | CC0 1.0 | Steadiest 8 s of the 27 s take (4.25 s on), mono, 50 Hz high-pass, 0.4 s equal-power crossfaded loop, light compression and limiting, normalized to -23 LUFS |
| `torch-fire.m4a` | ["Campfire (Position 2)"](https://freesound.org/people/SKrafft/sounds/681367/) | SKrafft | CC0 1.0 | 8 s section (13 s on), mono, 80 Hz high-pass, light `afftdn` denoise, 0.4 s crossfaded loop, +47 dB of gain with compression and limiting, normalized to -23 LUFS |
| `pops.m4a` | ["Pinewood fire pops"](https://freesound.org/people/YouMightLikeThis/sounds/785057/) | YouMightLikeThis | CC0 1.0 | 8 isolated pops cut out (mono, 100 Hz high-pass, short fades), each peak-normalized to -3 dBFS and joined into one sprite with gaps |
| `pillar-roar.m4a` | ["Fire -massive no cracking"](https://freesound.org/people/Aegersum/sounds/387924/) | Aegersum | CC0 1.0 | Mono, slowed to half speed (one octave down), low-passed at 800 Hz, 10 s section with a 1 s crossfaded loop, compressed, normalized to -23 LUFS |
| `wind.m4a` | ["Looping Gentle Wind Ambience on an Open Desert Plain"](https://freesound.org/people/dhallcomposer/sounds/697217/) | dhallcomposer | CC0 1.0 | Stereo, 22 s section (14.8 s on), 40 Hz high-pass, 1.5 s crossfaded loop, normalized to -23 LUFS |
| `insects.m4a` | ["Slight cricket singing with silent breeze recorded at night in the desert"](https://freesound.org/people/felix.blume/sounds/651241/) | felix.blume | CC0 1.0 | Stereo, resampled from 96 kHz to 48 kHz, 24 s section (56.55 s on), 100 Hz high-pass, 1.5 s crossfaded loop, normalized to -26 LUFS |
