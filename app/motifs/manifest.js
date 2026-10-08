// Madhubani motif manifest — the authored SVG library.
//
// Each motif is a real .svg file, hand-drawn with bezier paths. The shader will
// only ever PLACE and COLOUR these; the drawing itself lives here, editable as
// plain SVG, so it can be revised by an artist without touching any code.
//
// ── The role contract ────────────────────────────────────────────────────────────────────────────
// A motif never hardcodes a colour. It paints into named ROLES, and the page (or
// later the atlas shader) binds each role to a palette slot. That is what lets
// one drawing serve all eight palettes.
//
//   class   paint                 palette slot
//   ------  --------------------  --------------------------------------------
//   g       fill ground           palette.f[3]  (the pale end of the ramp)
//   fi      fill ink              palette.ink
//   fa      fill A                palette.f[0]
//   fb      fill B                palette.f[1]
//   bd      fill bead             palette.bead
//   si      stroke ink, no fill   palette.ink
//   sa      stroke A, no fill     palette.f[0]
//   sia     stroke ink + fill A   palette.ink over palette.f[0]
//   sib     stroke ink + fill B   palette.ink over palette.f[1]
//
// These nine roles are exactly the channels the future texture array will store,
// so the atlas bake is a straight read of the same classes — no second contract
// to keep in sync.
//
// ── Geometry ─────────────────────────────────────────────────────────────────────────────────────
// viewBox is 0 0 100 100. In bomb mode every seed draws its own tile in its own
// tangent plane with a slight rotation, and neighbours overlap, so a motif does
// NOT need to tile seamlessly. It needs to be a self-contained mark that covers
// most of its cell and reads as Madhubani on its own. Paths are allowed to run
// past the viewBox (-8, 108) when a motif bleeds off its edge on purpose.
import { STYLE_KEYS } from '../../src/core/render/madhubani/params.js';

// ── The vocabulary ───────────────────────────────────────────────────────────────────────────────
// Twelve motifs per style. Eight of them are assigned to the eight body zones (see zones.js), one
// per zone, so NO motif is ever reused across two zones — that repetition was the flaw in the old
// 4-per-style layout. The remaining four are SPARES: they exist so the shader can vary the print
// between individuals of the same species (a seed picks a different spare for a zone), and so there
// is somewhere to put an authored motif later (lotus on the shoulder, a border along the back).
//
// The twelve per style, as [name, drawing intent].
export const TILES = {
  scallop: [
    ['scale + bead', 'the hero scale: one imbricated fish-scale, bold rim, centre bead'],
    ['double scale', 'a second smaller scale nested inside the first, two tones'],
    ['scale row + rule', 'a row of scales closed by a doubled horizontal rule'],
    ['dense 2x2', 'four small scales per tile, the fine grain for legs and muzzle'],
    ['scale fan', 'scales radiating from a point in an arc — haunch, shoulder, hip'],
    ['small scale + dot row', 'tiny scales with a row of dots between them — muzzle, feet'],
    ['ridge + spine line', 'scales with a strong vertical spine line through them — the back'],
    ['scallop edge band', 'a horizontal band of small scalloped arcs — a border strip'],
    ['offset brick scales', 'scales laid as offset brickwork, no stagger of rows'],
    ['scale quadrant', 'a quarter-fan of scales for corners and joints'],
    ['triple scale stack', 'three scales of decreasing size, nested like a roof'],
    ['scale + arc echo', 'one scale with concentric echo arcs trailing behind it'],
  ],
  vyaghra: [
    ['plain bands', 'horizontal bands, each tapering slightly at both ends'],
    ['tapered notch', 'the bold stripe: wide belly, needle tip, forked root'],
    ['double band', 'a thick band with a thinner band nested inside, ground between'],
    ['band + zigzag', 'a filled band with a sawtooth edge one side, smooth the other'],
    ['flame stripe', 'a vertical flame with barbs flicking off a centre vein'],
    ['stripe pair + bead', 'two parallel tapered stripes with a bead between them'],
    ['stripe ladder', 'tapered stripes joined by short rungs'],
    ['broken stripe', 'a stripe broken into dashes of decreasing length'],
    ['stripe + chevron', 'a tapered stripe with a row of chevrons beneath it'],
    ['stripe fan', 'stripes radiating from a single point in an arc'],
    ['thick-thin rhythm', 'alternating thick and hairline stripes — a rhythm band'],
    ['stripe border band', 'a stripe with a parallel hairline above and below — an edge'],
  ],
  kohbar: [
    ['lotus rosette', 'two rings of tapered petals around a centre bead'],
    ['fish', 'pointed-oval body, forked tail, bead eye, dorsal fin, gill arcs'],
    ['bamboo', 'two or three curved stalks with visible nodes and small leaves'],
    ['framed panel', 'a decorated border: outer rule, inner rule, beads set in the gap'],
    ['peacock', 'a peacock with a fanned crest tail, each feather eye-spotted'],
    ['turtle', 'a turtle with a segmented shell, head and four legs'],
    ['sun / chakra', 'a rayed sun disc with concentric rings and a centre bead'],
    ['tree of life', 'a tree with a branching canopy and a pair of birds'],
    ['double fish', 'two fish facing each other around a shared centre'],
    ['lotus border strip', 'a repeating row of small lotuses — a border'],
    ['kalash', 'a decorated pot with a coconut and leaves at its mouth'],
    ['conch / shankh', 'a conch shell with a spiral body and radiating ridges'],
  ],
  katchni: [
    ['parallel', 'wobbling near-parallel ruling across a fill-A ground'],
    ['cross-hatch', 'two wobbling ruling families crossing at an angle, rhythmically broken'],
    ['stipple rings', 'concentric rings of dots, spacing and size varying ring to ring'],
    ['wave', 'wobbling undulating lines with beads riding the crests'],
    ['fine hatch', 'a denser version of parallel, for small parts'],
    ['basket weave', 'over-under woven bands, horizontal crossing vertical'],
    ['dotted diagonal', 'diagonal rows of short dashes with beads at the intersections'],
    ['herringbone', 'chevrons stacked in offset rows'],
    ['double wave', 'two wave families interleaved, one fine one broad'],
    ['spiral', 'a field of small spirals, alternating direction'],
    ['net / lattice', 'a diamond lattice of wobbling lines with a bead at each node'],
    ['hatch border band', 'ruling one way, bounded by two rules — an edge strip'],
  ],
  godna: [
    ['dot rows', 'staggered rows of dots, size varying row to row'],
    ['dashes', 'rows of short rounded dashes, hand-cut lengths and gaps'],
    ['crosses', 'a staggered field of small plus-marks, a bead every third'],
    ['triangle row', 'small upright triangles on a ruled baseline, alternating fills'],
    ['chevrons', 'rows of small V marks, nested'],
    ['concentric dots', 'a centre dot ringed by larger dots, like a target'],
    ['comma marks', 'small teardrop / comma strokes, all leaning the same way'],
    ['diamond lattice', 'outlined diamonds in a staggered grid'],
    ['dot + dash mix', 'dots and dashes interleaved in one rhythm'],
    ['ring of dots', 'a circular ring of dots with a centre bead'],
    ['comb marks', 'a short spine with perpendicular teeth, like a comb'],
    ['dotted border', 'a pair of rules with a dotted channel between them'],
  ],
  tantrik: [
    ['concentric rings', 'nested rings with irregular spacing, radial ticks, centre bead'],
    ['petal rosette', 'two rings of tapered petals around a centre bead — the flagship'],
    ['opposed triangles', 'two triangles meeting apex to apex, beads at each apex'],
    ['star grid', 'a 2x2 grid of four eight-point stars, each two rotated squares'],
    ['mandala', 'a fuller mandala: rings, petals and spokes with a square core'],
    ['svastika grid', 'a grid of interlocking right-angled hooks'],
    ['nested squares', 'squares rotated 45 degrees inside each other'],
    ['radial spokes + rings', 'a spoke burst crossed by two rings'],
    ['lotus wheel', 'a ring of petals around a spoked hub'],
    ['diamond grid', 'a lattice of diamonds with a bead in each cell'],
    ['yantra border', 'a border band of repeating nested triangles'],
    ['half-mandala fan', 'a quarter mandala for corners and joints'],
  ],
  bharni: [
    ['filled lotus', 'solid petal mass, A outer and B inner, ink veins on top'],
    ['filled fish', 'solid body, filled forked tail, bead eye, gill arcs on the fill'],
    ['filled paisley', 'the kairi: a solid teardrop with a curled tail and a nested inner curl'],
    ['filled medallion', 'a large filled disc, an inner ring, radial ticks, a centre bead'],
    ['filled peacock', 'a solid peacock with an eye-spotted fanned tail'],
    ['filled turtle', 'a solid turtle with a segmented shell'],
    ['filled sun', 'a solid rayed disc with alternating A and B rays'],
    ['filled tree', 'a solid canopy tree with a filled trunk'],
    ['filled feather', 'a solid peacock feather with an eye at the tip'],
    ['filled kalash', 'a solid decorated pot with leaves at its mouth'],
    ['filled mango leaf', 'a solid mango leaf with a midrib and vein hatching'],
    ['filled medallion band', 'a row of small filled medallions — a border strip'],
  ],
};

export const TILE_COUNT = 12;

export const STYLE_NOTES = {
  scallop: 'The hero scale field — the ground the whole animal sits on. Tile 0 is the reference scale. The spares (fan, ridge, edge band, brick) exist for the haunch, the spine and the borders.',
  vyaghra: 'Tiger stripes. Tapered, notched, flame-like strokes rather than flat bars — a flat bar reads as a barcode, a tapered one reads as a brush stroke.',
  kohbar: 'The nuptial vocabulary of a Mithila wedding canopy. Lotus, fish, bamboo, peacock, turtle, sun, tree of life, conch — the figurative marks that carry the most meaning.',
  katchni: 'Line work. The ground-hatching family. Every line carries a hand-wobble so it does not read as machine ruling.',
  godna: 'Tattoo marks, named for the godna kohl stick. Deliberately sparse — open ground between marks so the quiet zones can breathe.',
  tantrik: 'Yantra geometry. Radial and mandala-like, for the spine and haunches. The one family where exact symmetry is correct.',
  bharni: 'The loud style. The same figurative vocabulary as kohbar but filled solid — big flat colour mass with a confident ink outline, for the shoulder, haunch and flank.',
};

export const TILE_LABELS = Object.fromEntries(
  Object.entries(TILES).map(([k, v]) => [k, v.map(([name]) => name)])
);

/** Every motif in the library, in style order. `src` is relative to app/. */
export const MOTIFS = STYLE_KEYS.flatMap((style) =>
  Array.from({ length: TILE_COUNT }, (_, i) => ({
    key: `${style}-${i}`,
    style,
    index: i,
    label: TILES[style][i][0],
    intent: TILES[style][i][1],
    src: `./motifs/${style}/${i}.svg`,
  }))
);

export const motifsFor = (style) => MOTIFS.filter((m) => m.style === style);
