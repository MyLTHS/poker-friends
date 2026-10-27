export type Direction = 'club' | 'grid'

export const themes: Record<Direction, React.CSSProperties> = {
  club: {
    '--ink': '#fff7e7', '--muted': '#bdb3a0', '--canvas': '#081511',
    '--panel': '#11231d', '--panel-2': '#183129', '--line': 'rgba(255,245,220,.13)',
    '--felt': '#0e563d', '--accent': '#e9b85f', '--accent-2': '#f4d99a',
    '--danger': '#ef6b64', '--radius': '18px', '--shadow': '0 20px 55px rgba(0,0,0,.34)',
    '--font-display': 'Georgia, Cambria, serif', '--font-body': 'Inter, ui-sans-serif, system-ui',
  } as React.CSSProperties,
  grid: {
    '--ink': '#eef3ff', '--muted': '#8e9ab3', '--canvas': '#070a12',
    '--panel': '#0d1220', '--panel-2': '#141c2e', '--line': 'rgba(150,170,220,.15)',
    '--felt': '#101b2a', '--accent': '#69e6c4', '--accent-2': '#91a9ff',
    '--danger': '#ff6577', '--radius': '12px', '--shadow': '0 24px 70px rgba(0,0,0,.48)',
    '--font-display': 'Inter, ui-sans-serif, system-ui', '--font-body': 'Inter, ui-sans-serif, system-ui',
  } as React.CSSProperties,
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 40 }
