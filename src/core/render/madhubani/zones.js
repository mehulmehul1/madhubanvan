// Zone maps for the Madhubani tile-field model.
//
// Each style maps the anatomy (designGroup, baked at build time by coatFields.js) to a FIELD TILE
// and a palette colour slot:
//   designGroup  0 trunk · 1 neck · 2 head · 3 legs · 4 paws · 5 tail · 6 wing · 7 fin
//
// The zone maps are deliberately DIFFERENT per style so the engines read differently on the animal
// (an earlier cut gave scallop and kohbar the same tile for every zone, so they looked identical).
//
// ── Twelve motifs per style ───────────────────────────────────────────────────────────────────────
// Each style owns TWELVE tiles (app/motifs/<style>/0..11.svg). The eight zones take eight DISTINCT
// tiles — one per zone, never reused. That is the fix for the old 4-per-style layout, where scallop
// put its tile 0 on four zones and the anatomy row read as the same motif repeated.
//
// The four tiles left over per style are SPARES: the shader can pick a different spare for a zone
// per seed so two individuals of one species are not identically marked, and there is somewhere to
// put authored placement later (lotus on the shoulder, a border along the back).
//
// The assignments below are a PROPOSAL grounded in how each motif behaves at that scale and on that
// part — bold figurative marks on the head and shoulder, fine hatching on legs and paws, linear marks
// on the tail and fin. They are meant to be argued with and moved.
//
// No zone is left plain.

export const ZONE_NAMES = ['trunk', 'neck', 'head', 'legs', 'paws', 'tail', 'wing', 'fin'];

//        designGroup:  0 trunk  1 neck  2 head  3 legs  4 paws  5 tail  6 wing  7 fin
export const STYLE_ZONES = {
  scallop: { tiles: [ 0,   7,   1,   3,   5,  11,   4,   2], slots: [0, 1, 2, 3, 0, 1, 2, 3], colours: 3 },
  vyaghra: { tiles: [ 0,   6,   1,  10,   7,  11,   4,   9], slots: [0, 1, 2, 3, 0, 1, 2, 3], colours: 3 },
  kohbar:  { tiles: [ 0,   1,   3,   2,   6,  10,   4,   9], slots: [0, 2, 1, 3, 0, 2, 1, 3], colours: 4 },
  katchni: { tiles: [ 0,   1,   2,   4,   7,   9,   5,  10], slots: [0, 1, 0, 1, 0, 1, 0, 1], colours: 2 },
  godna:   { tiles: [ 8,   0,   9,   1,   6,  11,   7,  10], slots: [0, 1, 0, 1, 0, 1, 0, 1], colours: 2 },
  tantrik: { tiles: [ 4,   0,   1,   3,   2,   7,   8,  10], slots: [0, 1, 2, 3, 0, 1, 2, 3], colours: 4 },
  bharni:  { tiles: [ 0,   2,   3,  10,   6,   4,   7,   8], slots: [0, 2, 1, 3, 0, 2, 1, 3], colours: 4 },
};

// How many tiles each style's library holds. The SDF renderer (fields.js) only implements the FIRST
// FOUR of each style, so chain mode can only reach tiles 0-3 today; the SVG library and the baked
// atlas carry all twelve. Until the atlas lands, tiles 4-11 exist as drawings only.
export const TILES_PER_STYLE = 12;
export const SDF_TILE_LIMIT = 4;

export const slotForRow = (slot, row, count) => ((slot + row) % count + count) % count;
