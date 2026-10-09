// Every seat in a duck race gets its own duck: a name, a body colour, and an
// accessory. All three are derived purely from the seat number, so the same
// contestant keeps the same look (and name) across rounds instead of
// reshuffling as the pool shrinks.

export const DUCK_NAMES = [
  'Quackers',
  'Sir Splashalot',
  'Puddles',
  'Captain Quack',
  'Waddles',
  'Bubbles',
  'Mallory',
  'Fuzzy Wuzzy',
  'Peaches',
  'Beaker',
  'Nugget',
  'Sunny',
  'Ripple',
  'Pickles',
  'Mr. Feathers',
  'Dabble',
  'Splish',
  'Splash',
  'Lily Pad',
  'Biscuit',
  'Noodle',
  'Ziggy',
  'Turbo',
  'Coconut',
  'Muffin',
  'Zippy',
  'Marshmallow',
  'Gizmo',
  'Sprinkles',
  'Tango',
  'Pebbles',
  'Waffles',
  'Peanut',
  'Cheddar',
  'Pip',
  'Squirt',
  'Doodle',
  'Jelly Bean',
  'Dumpling',
  'Bandit',
]

// body: main colour, shade: wing/darker tone, beak: bill colour (chosen so
// it stays visible against the body).
export const DUCK_BODIES = [
  { body: '#ffd23f', shade: '#f2b705', beak: '#ff8a00' }, // classic yellow
  { body: '#ff7eb6', shade: '#e0509a', beak: '#ffc300' }, // pink
  { body: '#5cc8ff', shade: '#2e9bd6', beak: '#ff8a00' }, // sky blue
  { body: '#7ed957', shade: '#4caf32', beak: '#ff8a00' }, // lime
  { body: '#ff6b6b', shade: '#d93a40', beak: '#ffc300' }, // coral red
  { body: '#b388ff', shade: '#8b5cf6', beak: '#ffc300' }, // purple
  { body: '#ffffff', shade: '#cfe0ee', beak: '#ff8a00' }, // white
  { body: '#9a6232', shade: '#6b4423', beak: '#ffb020' }, // chocolate
]

export const DUCK_ACCESSORY_COUNT = 10

export function getDuckLook(seatNumber) {
  const seat = Math.max(0, Math.trunc(seatNumber) || 0)
  const bodyCount = DUCK_BODIES.length
  const bodyIdx = seat % bodyCount
  // Shifting the accessory by how many full colour cycles have passed means
  // the (colour, accessory) pair only repeats after 80 seats.
  const accessory = (seat + Math.floor(seat / bodyCount)) % DUCK_ACCESSORY_COUNT
  return {
    name: DUCK_NAMES[(seat + DUCK_NAMES.length - 1) % DUCK_NAMES.length],
    ...DUCK_BODIES[bodyIdx],
    accessory,
  }
}
