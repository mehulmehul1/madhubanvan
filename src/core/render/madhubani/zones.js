// Zone maps for the Madhubani tile-field model.
//
// Each style maps the anatomy (designGroup, baked at build time by coatFields.js) to a FIELD TILE
// and a palette colour slot:
//   designGroup  0 trunk · 1 neck · 2 head · 3 legs · 4 paws · 5 tail · 6 wing · 7 fin
//
// The zone maps are deliberately DIFFERENT per style so the engines read differently on the animal
// (an earlier cut gave scallop and kohbar the same tile for every zone, so they looked identical).
//
// tile ids are LOCAL to each style's own library (see the STYLE_TILES sets in fields.js):
//   scallop  0 scale · 1 double scale · 2 scale+line · 3 small scales
//   vyaghra  0 band  · 1 tapered     · 2 double band · 3 band+zigzag
//   kohbar   0 lotus · 1 fish        · 2 bamboo      · 3 frame
//   katchni  0 parallel · 1 cross    · 2 stipple     · 3 wave
//   godna    0 dots · 1 dashes       · 2 crosses     · 3 triangles
//   tantrik  0 rings · 1 rosette     · 2 triangles   · 3 star
//
// Zone maps are deliberately different per style, and NO zone is left plain.

export const ZONE_NAMES = ['trunk', 'neck', 'head', 'legs', 'paws', 'tail', 'wing', 'fin'];

export const STYLE_ZONES = {
  scallop: { tiles: [0, 0, 3, 2, 1, 0, 2, 0], slots: [0, 1, 2, 1, 0, 2, 1, 1], colours: 3 },
  vyaghra: { tiles: [0, 0, 3, 1, 2, 0, 1, 1], slots: [0, 1, 2, 1, 0, 2, 1, 1], colours: 3 },
  kohbar: { tiles: [0, 2, 1, 3, 0, 1, 2, 3], slots: [0, 2, 1, 3, 0, 2, 1, 3], colours: 4 },
  katchni: { tiles: [0, 1, 2, 0, 1, 3, 1, 0], slots: [0, 1, 0, 1, 0, 1, 0, 1], colours: 2 },
  godna: { tiles: [0, 1, 2, 3, 0, 1, 2, 3], slots: [0, 1, 0, 1, 0, 1, 0, 1], colours: 2 },
  tantrik: { tiles: [1, 0, 2, 3, 0, 1, 2, 3], slots: [0, 1, 2, 3, 0, 1, 2, 3], colours: 4 },
  bharni: { tiles: [0, 1, 3, 2, 0, 1, 3, 2], slots: [0, 1, 2, 3, 0, 1, 2, 3], colours: 4 },
};

export const slotForRow = (slot, row, count) => ((slot + row) % count + count) % count;
