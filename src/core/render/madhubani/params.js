// Madhubani style vocabulary (tile-field model).
//
// A style is a *zone-driven field engine*: zones.js maps each body group to a field tile + colour
// slot, and a style adds the tile size (in METRES, so tiles are the same physical size on every
// species) plus the global art parameters.
//
// Every style is multi-colour; `colours` is the target count (2-4) and the shader varies it around
// that target per seed, so you get 2/3/4-colour animals from the same style (see color.js).

export const STYLES = {
  scallop: { label: 'Scallop · scale field', tileH: 0.085, tileW: 0.072, hatch: 3, outline: 0.10, wobble: 0.030, colours: 3, rim: 0.40 },
  vyaghra: { label: 'Vyaghra · tiger', tileH: 0.110, tileW: 0.090, hatch: 3, outline: 0.10, wobble: 0.050, colours: 3, rim: 0.45 },
  kohbar: { label: 'Kohbar · nuptial', tileH: 0.075, tileW: 0.062, hatch: 3, outline: 0.11, wobble: 0.040, colours: 4, rim: 0.38 },
  katchni: { label: 'Katchni · line work', tileH: 0.070, tileW: 0.060, hatch: 7, outline: 0.07, wobble: 0.030, colours: 2, rim: 0.34 },
  godna: { label: 'Godna · tattoo dots', tileH: 0.060, tileW: 0.060, hatch: 3, outline: 0.06, wobble: 0.020, colours: 2, rim: 0.32 },
  tantrik: { label: 'Tantrik · yantra', tileH: 0.095, tileW: 0.082, hatch: 3, outline: 0.10, wobble: 0.025, colours: 4, rim: 0.38 },
  bharni: { label: 'Bharni · filled', tileH: 0.120, tileW: 0.100, hatch: 3, outline: 0.12, wobble: 0.030, colours: 4, rim: 0.42 },
};

export const STYLE_KEYS = ['scallop', 'vyaghra', 'kohbar', 'katchni', 'godna', 'tantrik', 'bharni'];

// Palette families sampled from Madhubani work: paper + lampblack ink + four fills + bead highlight.
// The four fills are the zone-colour pool — every style draws from all of them, so nothing is
// locked to two tones.
export const PALETTES = [
  { id: 'haldi-geru', paper: 0xEFE2C6, ink: 0x241B12, f: [0xB8892F, 0xC8563A, 0x3F5B4A, 0xEDE3CE], bead: 0xE4B33E },
  { id: 'kohbar', paper: 0xF2E8D2, ink: 0x1E1710, f: [0xC64A34, 0xE0A32C, 0x3F7A46, 0xD9C9A8], bead: 0xC8752E },
  { id: 'chuna', paper: 0xF6F1E2, ink: 0x14110C, f: [0xD0342C, 0x2E7D46, 0xE7B32B, 0xEDE6D2], bead: 0xC25A2A },
  { id: 'neel', paper: 0xEDE7D6, ink: 0x121620, f: [0x1E3A6E, 0x2E6FA6, 0xC9A227, 0xDFD8C2], bead: 0xE0A32C },
  { id: 'marigold', paper: 0xF1E6CC, ink: 0x1B140C, f: [0xE08A22, 0x2E7D46, 0xA62B2B, 0xEFE7D4], bead: 0xE7B32B },
  { id: 'polo', paper: 0xF4EAD6, ink: 0x1A130D, f: [0xA32E22, 0xCF9A2C, 0x35563E, 0xB8A98C], bead: 0xD8802C },
  { id: 'sindoor', paper: 0xF0E4CE, ink: 0x1C140B, f: [0xC0392B, 0x1E1A16, 0xDBA62F, 0xE2D3B4], bead: 0xC8622A },
  { id: 'godna', paper: 0xE7DFC9, ink: 0x1A1611, f: [0x6E5B3E, 0x3A3226, 0xA98C55, 0xD8CDB2], bead: 0x8A6E3C },
];

// --- Tile-bombing ("Option A") constants, in METRES (bind space, post-warp) ---
export const MAD_SEED_TEXELS = 5;                 // RGBA texels per seed in the seed texture
