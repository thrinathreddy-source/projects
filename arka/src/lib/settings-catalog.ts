/**
 * The cultural lexicon — the part of Arka that is actually proprietary.
 *
 * Anime models are trained overwhelmingly on Japanese-set artwork. Their prior
 * for "temple" is a torii gate and a pagoda; for "street", a shotengai with
 * vertical signage. Ask one for "a Kerala rooftop" and you will most likely get
 * a Japanese rooftop with a brown-skinned character standing on it. That is not
 * a quality failure, it is a geography failure, and no amount of "make it look
 * Indian" fixes it.
 *
 * Two things fix it, and both live here.
 *
 * First, the generic noun never reaches the model. A user writes "a temple";
 * we send "dravidian gopuram, tiered vimana, carved granite kumbhapanjara".
 * Specific vocabulary that exists in the training captions beats an adjective
 * every time.
 *
 * Second, we actively push against the default. The `JAPANESE_DEFAULTS`
 * negative below is the cheapest, least obvious win in the whole product —
 * without it, output drifts back to Kyoto no matter how good the positive
 * prompt is.
 *
 * Every setting is deliberately a *place with materials*, not a mood. Light,
 * stone, cloth and flora are what make an establishing shot read as somewhere
 * real.
 */

export type Setting = {
  id: string;
  label: string;
  description: string;
  /** Architecture, materials, flora, light — the environment vocabulary. */
  scene: string;
  /** What people in this place and period wear. */
  dress: string;
  /** Palette guidance, kept short so it steers without dominating. */
  palette: string;
  /** Extra negatives specific to this setting's common failure mode. */
  avoid: string;
  accent: string;
};

export const SETTINGS = [
  {
    id: "dravidian",
    label: "Temple South",
    description: "Gopurams, granite, brass lamps, temple tanks.",
    scene:
      "dravidian gopuram, tiered vimana tower, carved granite pillars, kumbhapanjara niches, stone temple courtyard, temple tank with steps, brass oil lamps, kolam drawn in rice flour, plantain leaves, coconut palms, banyan tree",
    dress:
      "silk veshti, kanjivaram saree, temple jewellery, jasmine flowers in braided hair, sacred ash on forehead",
    palette: "warm ochre, granite grey, temple gold, deep vermilion",
    avoid: "pagoda, zen garden, bamboo",
    accent: "#e0872f",
  },
  {
    id: "mughal",
    label: "Mughal Court",
    description: "Red sandstone, marble jaali, charbagh gardens.",
    scene:
      "mughal architecture, red sandstone walls, white marble inlay, cusped arches, marble jaali lattice screens, charbagh garden with water channels, domed pavilion, pietra dura floral inlay, cypress trees, reflecting pool",
    dress:
      "angarkha, jama robe, churidar, embroidered dupatta, turban with sarpech jewel, strands of pearls",
    palette: "red sandstone, ivory marble, emerald green, gold leaf",
    avoid: "pagoda, tatami, minimalist",
    accent: "#c0453a",
  },
  {
    id: "rajputana",
    label: "Desert Fort",
    description: "Sandstone forts, jharokhas, blue towns, dunes.",
    scene:
      "rajput hill fort, yellow sandstone ramparts, jharokha balconies, chhatri domed pavilions, stepwell with descending stairs, blue-painted old town houses, thar desert dunes, camel caravan, mirrored haveli interior",
    dress:
      "bandhani odhni, ghagra skirt, mirror-work embroidery, safa turban, silver anklets and bangles",
    palette: "sand yellow, indigo blue, dusty rose, brass",
    avoid: "pagoda, sakura, snow",
    accent: "#d9a441",
  },
  {
    id: "malabar",
    label: "Backwaters",
    description: "Kerala. Tile roofs, laterite, monsoon, water.",
    scene:
      "kerala backwaters, nalukettu courtyard house, sloping clay tile roof, laterite brick walls, wooden verandah pillars, coconut palms leaning over water, houseboat, monsoon rain, water hyacinth, paddy fields",
    dress:
      "kasavu mundu, off-white cotton with gold border, jasmine garland, simple gold jewellery",
    palette: "wet green, terracotta, rain grey, gold border",
    avoid: "pagoda, sakura, desert, snow",
    accent: "#4a8f5b",
  },
  {
    id: "ghats",
    label: "River Ghats",
    description: "Varanasi. Stone steps, boats, smoke, marigold.",
    scene:
      "varanasi ghats, wide stone steps descending to the ganges, wooden rowing boats, temple spires along the waterfront, sadhu seated cross-legged, incense smoke, marigold garlands on the water, brass vessels, morning mist, floating oil lamps",
    dress: "saffron robe, rudraksha bead strands, cotton dhoti, woollen shawl",
    palette: "marigold orange, river grey, saffron, smoke blue",
    avoid: "pagoda, sakura, neon",
    accent: "#e2703a",
  },
  {
    id: "chawl",
    label: "Bombay 1970s",
    description: "Chawl balconies, deco cinemas, black-yellow taxis.",
    scene:
      "1970s bombay chawl, common balcony corridor, rusted iron railings, saris drying on a line, art deco cinema hoarding hand-painted, black and yellow taxi, ambassador car, monsoon puddles, single bulb light, crowded tenement",
    dress:
      "bell-bottom trousers, printed polyester saree, side-parted hair, thick spectacles",
    palette: "faded teal, nicotine yellow, rust, sodium lamp orange",
    avoid: "pagoda, sakura, modern skyscraper, clean minimalism",
    accent: "#b8894a",
  },
  {
    id: "gully",
    label: "Modern Gully",
    description: "Today's India. Wires, hoardings, tea stalls.",
    scene:
      "narrow indian street gully, exposed brick, tangled overhead electrical wires, hand-painted devanagari shop hoardings, monsoon-stained concrete, auto rickshaw, plastic chairs outside a tea stall, corrugated shutters, stray dog, scooter parked",
    dress: "kurta with jeans, office shirt, backpack, cotton dupatta, sneakers",
    palette: "concrete grey, hoarding blue, tea-stall steel, sodium orange",
    avoid: "pagoda, sakura, tokyo, japanese signage",
    accent: "#5a8fb8",
  },
  {
    id: "himalaya",
    label: "Himalaya",
    description: "Monasteries, prayer flags, deodar, snow peaks.",
    scene:
      "himalayan monastery, whitewashed walls with ochre trim, rows of prayer wheels, prayer flags strung across the valley, snow peaks behind, deodar forest, butter lamps burning, thangka paintings on the wall, stone path",
    dress: "chuba robe, thick woollen shawl, felt boots, turquoise beads",
    palette: "snow white, monastery ochre, deep maroon, sky blue",
    avoid: "pagoda, sakura, tropical",
    accent: "#7a9bb5",
  },
] as const satisfies readonly Setting[];

export type SettingId = (typeof SETTINGS)[number]["id"];

const BY_ID = new Map(SETTINGS.map((setting) => [setting.id, setting]));

export function getSetting(id: string): Setting {
  return BY_ID.get(id as SettingId) ?? SETTINGS[0];
}

/**
 * The single highest-value negative prompt in the product.
 *
 * Anime models fall back to Japan when they are unsure, and they are unsure
 * constantly. Naming the default explicitly is what keeps a Varanasi ghat from
 * quietly becoming a Kyoto riverbank.
 */
export const JAPANESE_DEFAULTS =
  "torii gate, pagoda, sakura, cherry blossom, kimono, yukata, tatami, shoji screen, " +
  "shinto shrine, japanese architecture, japanese signage, tokyo, mount fuji, ramen";

/** Baseline quality negatives every anime image model expects. */
export const QUALITY_NEGATIVES =
  "worst quality, low quality, lowres, bad anatomy, bad hands, extra digits, " +
  "fewer digits, text, watermark, signature, username, jpeg artifacts, blurry, " +
  "3d, cgi, render, realistic, photorealistic, photo";

/** Danbooru-style quality prefix. These models are trained to expect it. */
export const QUALITY_PREFIX = "masterpiece, best quality, absurdres, highly detailed";

/**
 * Safety negatives, appended to every render, always.
 *
 * This is the strongest of the content-safety layers and the only one that
 * acts on what the model *can produce* rather than guessing intent from text.
 * A prompt filter has to anticipate phrasing; this does not — it pushes the
 * sampler away from the imagery itself, so a prompt that slips past
 * `moderation.ts` still lands somewhere safe.
 *
 * Chosen surgically. `gore` and `mutilation` are here; plain `violence` and
 * `weapon` are not, because half the canon is Arjuna holding a bow and a
 * negative that neuters Kurukshetra has broken the product to protect it.
 * Likewise `sexualized child` is here and bare `child` is not — children at a
 * festival are ordinary, wholesome content this should never suppress.
 *
 * Not user-editable, and deliberately not an admin setting: a kill switch on
 * this is a kill switch on the thing that keeps the output publishable.
 */
export const SAFETY_NEGATIVES =
  "nsfw, nude, nudity, naked, topless, bare breasts, cleavage, underwear, " +
  "lingerie, sexualized, sexually suggestive, erotic, fetish, " +
  "gore, mutilation, dismemberment, severed limb, entrails, corpse, " +
  "blood splatter, grotesque, body horror, disturbing imagery, " +
  "loli, shota, sexualized child, " +
  "photorealistic face, real person, celebrity likeness, deepfake";

/**
 * Positive steering for devotional and mythological subjects.
 *
 * Added when the prompt touches religious material. Negatives say what to
 * avoid; this says what to aim at, and on these models an explicit positive
 * pulls harder than another negative. Reverent framing is also simply what the
 * audience for this product wants — the safety benefit and the quality benefit
 * point the same way.
 */
export const REVERENCE_PREFIX =
  "reverent, dignified, devotional, serene expression, traditional attire, " +
  "modest clothing, respectful portrayal, temple art tradition";
