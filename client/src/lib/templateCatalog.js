// The nine storefront design templates, in the order they should be shown.
// Single source of truth for the admin picker and the marketing showcase.
// swatch = [background, primary, sunken/border, accent] preview chips.
export const TEMPLATE_CATALOG = [
  {
    key: 'marketstall',
    name: 'Marketstall',
    blurb: 'Editorial ink-on-paper, electric accent, monospace prices. The flagship.',
    swatch: ['#fbfaf7', '#2422e0', '#f1efe9', '#ef3f1c'],
  },
  {
    key: 'warmwood',
    name: 'Warmwood',
    blurb: 'Warm literary serif, rounded, soft-shadowed. The classic look.',
    swatch: ['#fbf6ee', '#1f7a5c', '#f0e7d8', '#c2631f'],
  },
  {
    key: 'mono',
    name: 'Mono',
    blurb: 'High-contrast black & white, uppercase, hard edges. Gallery / boutique.',
    swatch: ['#ffffff', '#0a0a0a', '#f2f2f2', '#a61b0e'],
  },
  {
    key: 'petshop',
    name: 'Pet Shop',
    blurb: 'Rounded Baloo type, pill buttons, teal + coral. Friendly and approachable.',
    swatch: ['#fcf9f4', '#0e8a8a', '#f0ebe1', '#f2683f'],
  },
  {
    key: 'sarisari',
    name: 'Sari-Sari Store',
    blurb: 'Anton poster caps, yellow ground, soda-red + signage blue. Loud and local.',
    swatch: ['#fff8e6', '#d6262b', '#ffefc4', '#1f6fd6'],
  },
  {
    key: 'fashion',
    name: 'Fashion',
    blurb: 'Bodoni serif, wide tracking, oxblood accent, stark white. Editorial luxe.',
    swatch: ['#f7f5f2', '#17150f', '#eeeae4', '#7d2a3b'],
  },
  {
    key: 'tech',
    name: 'Tech Shop',
    blurb: 'Monospace headings, cool greys, electric blue, razor corners. Dark-first.',
    swatch: ['#0b0d10', '#4d90ff', '#181c22', '#33c9e0'],
  },
  {
    key: 'autoparts',
    name: 'Auto Parts',
    blurb: 'Condensed Oswald caps, safety orange, stencil part numbers, heavy borders.',
    swatch: ['#f2f2f0', '#2b2b2b', '#e6e6e2', '#f25c05'],
  },
  {
    key: 'hobby',
    name: 'Hobby Shop',
    blurb: 'Friendly Zilla slab, kraft paper, forest green + brick, gently rounded.',
    swatch: ['#f8f3e9', '#2f6b46', '#eee3cd', '#c1502e'],
  },
]

export const TEMPLATE_META = Object.fromEntries(TEMPLATE_CATALOG.map((t) => [t.key, t]))
