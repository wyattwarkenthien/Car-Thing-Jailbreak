// App registry for the home screen.
// kind 'page'   -> a separate HTML app in apps/<id>/index.html, opened full screen
// kind 'panel'  -> a screen built into the launcher (settings, placeholders)

export interface AppDef {
  id: string
  name: string
  colors: [string, string] // icon gradient, top -> bottom
  glyph: string // inner SVG markup, 24x24 viewBox, stroked in white
  kind: 'page' | 'panel'
  url?: string
  status?: string // short status shown on placeholder panels
  blurb?: string
}

const S = 'fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'

export const APPS: AppDef[] = [
  {
    id: 'westward',
    name: 'Westward',
    colors: ['#f0b25a', '#b4581f'],
    glyph: `<g ${S}><path d="M5.5 13.5L4 6.2Q12 2.6 20 6.2L18.5 13.5"/><path d="M9.5 4.7L10 13.5M14.5 4.7L14 13.5"/><path d="M3 13.5h18"/><circle cx="7.5" cy="17.8" r="3.2"/><circle cx="16.5" cy="17.8" r="3.2"/><path d="M7.5 14.6v6.4M4.3 17.8h6.4M16.5 14.6v6.4M13.3 17.8h6.4"/></g>`,
    kind: 'page',
    url: 'apps/westward/index.html?from=home',
  },
  {
    id: 'music',
    name: 'Music',
    colors: ['#ff7a95', '#d1325f'],
    glyph: `<g ${S}><path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></g>`,
    kind: 'panel',
    status: 'Not built yet',
    blurb: 'A now-playing screen for the music on your Mac. Turn the dial for volume, press to play or pause, and use the presets for playlists. Sound plays from the Mac, since the Car Thing has no speaker.',
  },
  {
    id: 'radio',
    name: 'Radio',
    colors: ['#52d8b4', '#11806a'],
    glyph: `<g ${S}><circle cx="12" cy="10" r="1.6"/><path d="M12 11.6V21M8.5 21h7"/><path d="M8.2 6.6a5 5 0 0 0 0 6.8M15.8 6.6a5 5 0 0 1 0 6.8"/><path d="M5.4 3.9a9 9 0 0 0 0 12.2M18.6 3.9a9 9 0 0 1 0 12.2"/></g>`,
    kind: 'panel',
    status: 'Not built yet',
    blurb: 'A companion screen for your UV-5R: a guide to local repeaters, weather and saved channels you browse with the dial, with live activity from an SDR on the Mac later on.',
  },
  {
    id: 'phone',
    name: 'Phone',
    colors: ['#67d777', '#2c9a43'],
    glyph: `<g ${S}><path d="M21 16.4v2.8a1.9 1.9 0 0 1-2.1 1.9 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.3 1.9 1.9 0 0 1 4 2.2h2.8a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L7.8 9.7a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 1.9z"/></g>`,
    kind: 'panel',
    status: 'Not built yet',
    blurb: 'Pair with your phone over Bluetooth. This needs a small Bluetooth helper running on the Car Thing first, which is the next piece to build.',
  },
  {
    id: 'settings',
    name: 'Settings',
    colors: ['#a3adb8', '#58626d'],
    glyph: `<g ${S}><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></g>`,
    kind: 'panel',
  },
]

// Preset buttons 1-4 (along the top of the Car Thing) open these apps.
export const PRESETS = ['westward', 'music', 'radio', 'phone']
