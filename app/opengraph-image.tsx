import { ImageResponse } from 'next/og'

// Dynamically-generated social card. Next auto-wires the og:image / twitter:image
// meta tags from this file - no static PNG or build-time image tooling needed.
export const runtime = 'edge'
export const alt = 'WC26 Fantasy XI - FIFA World Cup 2026 Fantasy'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '90px',
          background: 'linear-gradient(135deg, #04342C 0%, #0F6E56 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '8px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '9999px', background: '#5DCAA5' }} />
          <div style={{ fontSize: '30px', color: '#9FE1CB', letterSpacing: '4px', fontWeight: 600 }}>
            FIFA WORLD CUP 2026 FANTASY
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: '128px', fontWeight: 800, color: 'white', lineHeight: 1.05 }}>
          WC26 Fantasy&nbsp;<span style={{ color: '#5DCAA5' }}>XI</span>
        </div>

        <div style={{ display: 'flex', fontSize: '40px', color: '#9FE1CB', marginTop: '24px', fontWeight: 500 }}>
          Pick your 11. Score live. Beat your friends.
        </div>
      </div>
    ),
    { ...size },
  )
}
