// Static game data for Westward 1848. All text is original.

export type Item = 'oxen' | 'food' | 'clothing' | 'bullets' | 'wheels' | 'axles' | 'tongues'
export const ITEMS: Item[] = ['oxen', 'food', 'clothing', 'bullets', 'wheels', 'axles', 'tongues']

export const ITEM_INFO: Record<Item, { label: string; unit: string; storeLabel: string; storeUnit: string; perUnit: number; basePrice: number; step: number; max: number; advice: string }> = {
  oxen: { label: 'Oxen', unit: 'oxen', storeLabel: 'Oxen', storeUnit: 'yoke (2 oxen)', perUnit: 2, basePrice: 40, step: 1, max: 9, advice: 'Three yoke (six oxen) keep a wagon moving through mud and mountains. Fewer and you crawl.' },
  food: { label: 'Food', unit: 'lbs', storeLabel: 'Food', storeUnit: '10 lbs', perUnit: 10, basePrice: 2, step: 1, max: 200, advice: 'Each traveler eats up to 2 lbs a day. Plan on at least 200 lbs per person, and hunt along the way.' },
  clothing: { label: 'Clothing', unit: 'sets', storeLabel: 'Clothing', storeUnit: 'set', perUnit: 1, basePrice: 10, step: 1, max: 99, advice: 'Two sets per person keep you warm in the high country and any early snow.' },
  bullets: { label: 'Bullets', unit: 'rounds', storeLabel: 'Ammunition', storeUnit: 'box of 20', perUnit: 20, basePrice: 2, step: 1, max: 99, advice: 'Every shot costs a round. A dozen boxes will feed a careful hunter for months.' },
  wheels: { label: 'Wagon wheels', unit: 'spare', storeLabel: 'Wagon wheel', storeUnit: 'spare', perUnit: 1, basePrice: 10, step: 1, max: 3, advice: 'Rocky ground cracks wheels. A spare can save you days.' },
  axles: { label: 'Wagon axles', unit: 'spare', storeLabel: 'Wagon axle', storeUnit: 'spare', perUnit: 1, basePrice: 10, step: 1, max: 3, advice: 'A snapped axle stops a wagon dead. Carry one if you can afford it.' },
  tongues: { label: 'Wagon tongues', unit: 'spare', storeLabel: 'Wagon tongue', storeUnit: 'spare', perUnit: 1, basePrice: 10, step: 1, max: 3, advice: 'The tongue joins the oxen to the wagon. Steep descents snap them.' },
}

export type Occupation = 'banker' | 'carpenter' | 'farmer'
export const OCCUPATIONS: { id: Occupation; label: string; money: number; mult: number; blurb: string }[] = [
  { id: 'banker', label: 'Banker from Boston', money: 1600, mult: 1, blurb: 'Deep pockets, soft hands. Easiest start, lowest score.' },
  { id: 'carpenter', label: 'Carpenter from Ohio', money: 800, mult: 2, blurb: 'Handy with a broken wagon. Repairs succeed more often. Double score.' },
  { id: 'farmer', label: 'Farmer from Illinois', money: 400, mult: 3, blurb: 'Little money, but knows oxen and land. Oxen stay healthier. Triple score.' },
]

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const START_MONTHS = [
  { month: 2, label: 'March', note: 'Early. Grass is thin and rivers run high, but you beat the snow.' },
  { month: 3, label: 'April', note: 'The usual choice. Grass greening, rivers still swollen.' },
  { month: 4, label: 'May', note: 'Good grass and gentler rivers. Snow in the Blue Mountains becomes a worry.' },
  { month: 5, label: 'June', note: 'Late. Hot plains and a real race against autumn snow.' },
  { month: 6, label: 'July', note: 'Very late. Only the bold or foolish leave now.' },
]

export const NAME_POOL = ['Abigail', 'Silas', 'Martha', 'Ezra', 'Clara', 'Josiah', 'Hannah', 'Amos', 'Lydia', 'Jedediah', 'Ruth', 'Caleb', 'Eliza', 'Thaddeus', 'Mercy', 'Gideon', 'Prudence', 'Levi', 'Temperance', 'Obadiah', 'Delia', 'Wyatt', 'Nell', 'Hiram', 'Opal', 'Rufus', 'Sadie', 'Asa', 'Ida', 'Boone']

export type LandmarkKind = 'town' | 'river' | 'fort' | 'landmark' | 'end'
export type Region = 'prairie' | 'plains' | 'rockies' | 'snake' | 'cascades'

export interface River { width: number; depth: number; ferry?: number; guide?: boolean; current: number }
export interface Landmark {
  id: string; name: string; kind: LandmarkKind; region: Region; blurb: string; talk: string[]; river?: River; scene: 'town' | 'river' | 'fort' | 'rock' | 'chimney' | 'pass' | 'springs' | 'mountains' | 'valley' | 'dalles'
}

export const LANDMARKS: Record<string, Landmark> = {
  independence: { id: 'independence', name: 'Independence, Missouri', kind: 'town', region: 'prairie', scene: 'town',
    blurb: 'Wagons crowd every street of this river town. Outfitters, blacksmiths, and land agents all want your money before you leave the edge of the States.',
    talk: [
      '"Don\'t overload. I\'ve seen folks dump grandma\'s piano in the first hundred miles," says a wheelwright, hammering a rim.',
      'A woman with a baby on her hip: "Boil your water when you can. The sickness comes from the bad camps."',
      '"Oxen over mules," grunts a teamster. "Mules are quicker, but an ox will eat anything and keep walking."',
    ] },
  kansas_river: { id: 'kansas_river', name: 'Kansas River Crossing', kind: 'river', region: 'prairie', scene: 'river',
    river: { width: 620, depth: 3.6, ferry: 5, current: 0.5 },
    blurb: 'The first big water. A ferry runs here for those who can pay, and the banks are trampled to mud by the wagons ahead of you.',
    talk: [
      '"Ferryman charges five dollars and he earns it," says a man drying his boots. "I tried to ford and lost a sack of flour."',
      'A boy points at the water: "Pa says if it\'s over the wagon bed, don\'t you dare drive in."',
    ] },
  big_blue: { id: 'big_blue', name: 'Big Blue River Crossing', kind: 'river', region: 'prairie', scene: 'river',
    river: { width: 210, depth: 2.6, current: 0.4 },
    blurb: 'A narrower river with a sandy bottom. No ferry here. Folks either ford it or caulk their wagons and float across.',
    talk: [
      '"Spring rains make this one mean," says an old trapper. "Wait a day and she might drop a foot."',
      'A young couple argue about whether to float. The wife wins. They start smearing tar on the wagon seams.',
    ] },
  fort_kearney: { id: 'fort_kearney', name: 'Fort Kearny', kind: 'fort', region: 'plains', scene: 'fort',
    blurb: 'A new army post of sod and timber on the Platte River. Soldiers keep a register of the emigrants passing through. Thousands of names so far this year.',
    talk: [
      'A sergeant: "From here it\'s the Platte for weeks. Flat, dull, and the water tastes like mud. Don\'t drink from the low pools."',
      '"Buffalo herds are thick west of here," a hunter says. "One good shot feeds you for a week, if you can haul it."',
    ] },
  chimney_rock: { id: 'chimney_rock', name: 'Chimney Rock', kind: 'landmark', region: 'plains', scene: 'chimney',
    blurb: 'A spire of clay and sandstone rises hundreds of feet above the North Platte valley. Travelers can see it for days before reaching it. Many carve their names at its base.',
    talk: [
      'Someone has scratched "J. Holloway, Ohio, 1847" into the soft rock. Below it, fresh: "Still walking."',
      'A preacher: "God\'s own milepost. Halfway to the mountains, they say."',
    ] },
  fort_laramie: { id: 'fort_laramie', name: 'Fort Laramie', kind: 'fort', region: 'plains', scene: 'fort',
    blurb: 'An adobe trading post where the Laramie River meets the North Platte. Lakota, French traders, and weary emigrants mingle in its yard. Prices are steep.',
    talk: [
      'A French trader shrugs at your complaint about prices: "Everything here came seven hundred miles by wagon, monsieur. Same as you."',
      'A Lakota woman trades moccasins for coffee. Her husband watches the wagons with open curiosity.',
      '"Lighten your load before the mountains," a blacksmith warns. "The grade will do it for you otherwise."',
    ] },
  independence_rock: { id: 'independence_rock', name: 'Independence Rock', kind: 'landmark', region: 'plains', scene: 'rock',
    blurb: 'A great granite dome like a sleeping turtle. Reach it by the Fourth of July and you\'re on schedule. Its sides are covered with painted and carved names.',
    talk: [
      '"We made it by the Fourth!" a family cheers, waving a little flag.',
      'An old man is painting his late wife\'s name next to his own in axle grease.',
    ] },
  south_pass: { id: 'south_pass', name: 'South Pass', kind: 'landmark', region: 'rockies', scene: 'pass',
    blurb: 'A broad, gentle saddle over the Continental Divide. The climb is so gradual you hardly notice. From here every stream runs toward the Pacific.',
    talk: [
      '"That\'s it? I expected a mountain," laughs a young man. His father: "Be grateful."',
      'A guide: "Trail splits ahead. Green River\'s quicker but the crossing is deep. Fort Bridger\'s longer but has a store."',
    ] },
  green_river: { id: 'green_river', name: 'Green River Crossing', kind: 'river', region: 'rockies', scene: 'river',
    river: { width: 400, depth: 6.2, ferry: 10, current: 0.8 },
    blurb: 'A swift, cold river in a sagebrush basin. Mountain men run a ferry for a stiff price. It is far too deep to ford safely.',
    talk: [
      '"Ten dollars or swim," says the ferryman, not looking up from his whittling.',
      'A wagon\'s worth of goods lies drying on the bank. Someone tried to float it.',
    ] },
  fort_bridger: { id: 'fort_bridger', name: 'Fort Bridger', kind: 'fort', region: 'rockies', scene: 'fort',
    blurb: 'A small log trading post built by a famous mountain man. It sits in a green valley with good water and grass. A fine place to rest the oxen.',
    talk: [
      'A buckskin-clad trader: "Lost more oxen to bad water than to wolves. Let \'em graze here a few days."',
      '"Fifty miles more this way, but you\'ll eat better," a woman says, stirring a pot of beans.',
    ] },
  soda_springs: { id: 'soda_springs', name: 'Soda Springs', kind: 'landmark', region: 'rockies', scene: 'springs',
    blurb: 'Bubbling mineral springs, some cold and fizzy, one that spouts like a steam engine. Travelers mix the water with sugar and call it a treat.',
    talk: [
      '"Tastes like the soda fountain back in St. Louis!" a child shrieks, delighted.',
      'An old woman soaks her feet in a warm pool: "First time I\'ve smiled since Laramie."',
    ] },
  fort_hall: { id: 'fort_hall', name: 'Fort Hall', kind: 'fort', region: 'snake', scene: 'fort',
    blurb: 'A whitewashed Hudson\'s Bay Company post on the Snake River plain. The British factor is polite. His prices are not.',
    talk: [
      'The factor: "California is that way, Oregon this way. Most who ask me are sure of neither."',
      '"Snake River country is hot and dry," a trapper warns. "Grass is poor. Mind your oxen."',
    ] },
  snake_river: { id: 'snake_river', name: 'Snake River Crossing', kind: 'river', region: 'snake', scene: 'river',
    river: { width: 1000, depth: 6.4, guide: true, current: 0.9 },
    blurb: 'A wide, treacherous river with islands of gravel. Shoshone and Bannock guides know the safe route across and will lead wagons over for a trade.',
    talk: [
      'A guide studies your wagon and holds up three fingers, then points at your clothing chest.',
      '"Lost two oxen here last year," says a returning settler. "Should\'ve paid the guide."',
    ] },
  fort_boise: { id: 'fort_boise', name: 'Fort Boise', kind: 'fort', region: 'snake', scene: 'fort',
    blurb: 'A Hudson\'s Bay post at the mouth of the Boise River. Salmon dry on racks in the sun and the air smells of woodsmoke.',
    talk: [
      'A clerk: "Salmon\'s cheap and plentiful this time of year. Flour, not so much."',
      '"Blue Mountains next. Steep and timbered," says a man with a bandaged hand. "Check your tongue and axle."',
    ] },
  blue_mountains: { id: 'blue_mountains', name: 'The Blue Mountains', kind: 'landmark', region: 'cascades', scene: 'mountains',
    blurb: 'Dark pine forests climb steep ridges. Wagons must be winched and roped down some slopes. Early snow here has trapped parties before.',
    talk: [
      '"Whitman Mission\'s off north if you\'ve got the time," a scout says. "Otherwise straight on to The Dalles."',
      'Fresh stumps line the trail where earlier parties cut their way through.',
    ] },
  fort_walla_walla: { id: 'fort_walla_walla', name: 'Fort Walla Walla', kind: 'fort', region: 'cascades', scene: 'fort',
    blurb: 'A stout trading post near where the Walla Walla River joins the Columbia. The last real store before the end of the trail.',
    talk: [
      '"Rest up," says the trader. "The worst is close, but so is the end."',
      'A Cayuse horseman trades a fat salmon for a box of bullets with a quick, practiced grin.',
    ] },
  the_dalles: { id: 'the_dalles', name: 'The Dalles', kind: 'landmark', region: 'cascades', scene: 'dalles',
    blurb: 'The trail ends at the Columbia River gorge. From here you can raft your wagon downriver through dangerous rapids, or pay a toll and haul it over Mount Hood on the Barlow Road.',
    talk: [
      '"River\'s faster, if it doesn\'t kill you," says a raft builder, lashing logs.',
      '"Barlow Road\'s thirty dollars and pure misery," says Mr. Barlow\'s toll man. "But it\'s dry misery."',
    ] },
  willamette: { id: 'willamette', name: 'Willamette Valley', kind: 'end', region: 'cascades', scene: 'valley',
    blurb: 'Green fields, tall firs, and black soil deep enough to bury a plow. Oregon City\'s smoke rises in the distance. You made it.',
    talk: [] },
}

// Route: segments of [landmarkId, milesFromPrevious]
export const SEG_START: [string, number][] = [['independence', 0], ['kansas_river', 102], ['big_blue', 83], ['fort_kearney', 119], ['chimney_rock', 250], ['fort_laramie', 86], ['independence_rock', 190], ['south_pass', 102]]
export const SEG_SP_A: [string, number][] = [['green_river', 57], ['soda_springs', 144]]
export const SEG_SP_B: [string, number][] = [['fort_bridger', 125], ['soda_springs', 162]]
export const SEG_MID: [string, number][] = [['fort_hall', 57], ['snake_river', 182], ['fort_boise', 114], ['blue_mountains', 160]]
export const SEG_BM_A: [string, number][] = [['the_dalles', 125]]
export const SEG_BM_B: [string, number][] = [['fort_walla_walla', 55], ['the_dalles', 120]]
export const BARLOW_MILES = 110
export const RAFT_MILES = 100

export const ILLNESSES: { name: string; drain: number; days: [number, number] }[] = [
  { name: 'dysentery', drain: 4, days: [5, 10] },
  { name: 'cholera', drain: 5, days: [3, 7] },
  { name: 'typhoid fever', drain: 3.5, days: [6, 12] },
  { name: 'measles', drain: 3, days: [5, 9] },
  { name: 'mountain fever', drain: 2.5, days: [4, 9] },
  { name: 'exhaustion', drain: 2, days: [3, 6] },
]

export interface AnimalDef { name: string; meat: number; speed: number; w: number; h: number; color: string; weight: number }
export const ANIMALS: Record<string, AnimalDef> = {
  rabbit: { name: 'rabbit', meat: 2, speed: 210, w: 22, h: 16, color: '#c8b08a', weight: 5 },
  squirrel: { name: 'squirrel', meat: 1, speed: 240, w: 18, h: 14, color: '#9a6a44', weight: 4 },
  deer: { name: 'deer', meat: 50, speed: 150, w: 54, h: 44, color: '#a87444', weight: 3 },
  buffalo: { name: 'buffalo', meat: 300, speed: 70, w: 86, h: 58, color: '#4a3020', weight: 2 },
  pronghorn: { name: 'pronghorn', meat: 40, speed: 230, w: 48, h: 38, color: '#d49a5a', weight: 2 },
  elk: { name: 'elk', meat: 250, speed: 110, w: 76, h: 60, color: '#7a5032', weight: 2 },
  bear: { name: 'bear', meat: 100, speed: 85, w: 66, h: 48, color: '#2e2016', weight: 1 },
  goose: { name: 'goose', meat: 6, speed: 190, w: 30, h: 20, color: '#d8d0c0', weight: 3 },
}
export const REGION_ANIMALS: Record<Region, string[]> = {
  prairie: ['rabbit', 'squirrel', 'deer', 'goose'],
  plains: ['buffalo', 'rabbit', 'pronghorn', 'deer'],
  rockies: ['elk', 'deer', 'bear', 'rabbit', 'pronghorn'],
  snake: ['rabbit', 'goose', 'deer', 'pronghorn'],
  cascades: ['elk', 'deer', 'bear', 'squirrel'],
}

export const EPITAPHS = ['Rest easy, the trail is done.', 'Gone ahead to Oregon.', 'Loved and missed.', 'Walked far. Rests now.', 'Here lies a brave heart.']
