import { useState } from 'react'
import { Composition, continueRender, delayRender, staticFile } from 'remotion'
import { DURATION, Trailer } from './Trailer'

// Geist, the app's font, from public/fonts. Rendering waits until it's loaded.
const FONTS: [string, string, string][] = [
  ['Geist', '400', 'geist-sans-latin-400-normal.woff2'],
  ['Geist', '500', 'geist-sans-latin-500-normal.woff2'],
  ['Geist', '600', 'geist-sans-latin-600-normal.woff2'],
  ['Geist', '700', 'geist-sans-latin-700-normal.woff2'],
  ['Geist Mono', '400', 'geist-mono-latin-400-normal.woff2'],
]

function WithFonts() {
  const [handle] = useState(() => {
    const h = delayRender('Loading Geist')
    Promise.all(
      FONTS.map(([family, weight, file]) => {
        const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight })
        document.fonts.add(face)
        return face.load()
      }),
    ).then(() => continueRender(h))
    return h
  })
  void handle
  return <Trailer />
}

export function Root() {
  return <Composition id="Trailer" component={WithFonts} durationInFrames={DURATION} fps={60} width={1920} height={1080} />
}
