# Regenerates wordmark-light.svg and wordmark-dark.svg: python3 brand/wordmark.py (run inside brand/).
# Draws the "moss°" wordmark in the mark's style. All numbers are in one
# coordinate space; the m is the app icon's m scaled by k.
import math, sys
k = 40 / 92                      # icon stroke 92 → 40
W = 40                           # stroke width
base = 230                       # where strokes end at the bottom (centerline)
r = 109 * k                      # m arch radius (centerline)
archY = base - (682 - 494) * k   # m arch center y
top = archY - r                  # centerline top of every letter
gap = 18
def m(x0):
    a, b, c = x0, x0 + 2 * r, x0 + 4 * r
    return f"M {a:.1f} {base} V {archY:.1f} A {r:.1f} {r:.1f} 0 0 1 {b:.1f} {archY:.1f} V {base} M {b:.1f} {archY:.1f} A {r:.1f} {r:.1f} 0 0 1 {c:.1f} {archY:.1f} V {base}", c + W / 2
bottom = base - W / 2            # centerline bottom of round letters (outer bottom = base)
def o(left):
    ry = (bottom - top) / 2; rx = ry
    cx = left + W / 2 + rx; cy = top + ry
    return f"M {cx - rx:.1f} {cy:.1f} A {rx:.1f} {ry:.1f} 0 1 1 {cx + rx:.1f} {cy:.1f} A {rx:.1f} {ry:.1f} 0 1 1 {cx - rx:.1f} {cy:.1f} Z", cx + rx + W / 2
def s(left, rx=31):
    ry = (bottom - top) / 4
    cx = left + W / 2 + rx
    cu, cl = top + ry, bottom - ry
    a = math.radians(32)
    sx, sy = cx + rx * math.cos(a), cu - ry * math.sin(a)
    ex, ey = cx - rx * math.cos(a), cl + ry * math.sin(a)
    return (f"M {sx:.1f} {sy:.1f} A {rx:.1f} {ry:.1f} 0 1 0 {cx:.1f} {cu + ry:.1f} "
            f"A {rx:.1f} {ry:.1f} 0 1 1 {ex:.1f} {ey:.1f}"), cx + rx + W / 2
mp, x = m(0)
op, x = o(x + gap)
s1, x = s(x + gap)
s2, x = s(x + gap)
right = x
deg_r, deg_w = 15, 12
dcx, dcy = right + 12 + deg_r, top - 16
leaf = f'<path transform="translate({(722-294)*k:.1f} {base + (392-682)*k:.1f}) rotate(-42) scale({k:.4f})" d="M -6 0 C 30 -46 92 -62 148 -50 C 122 4 58 28 -6 0 Z" fill="{{leaf}}"/>'
bar_y = base + (666 - 682) * k
bar_h = 52 * k
x0, x1 = -W / 2 - 16 * k * 2.2, right + 8
vb = (x0 - 6, dcy - deg_r - 30, dcx + deg_r + deg_w / 2 + 8 - (x0 - 6), bar_y + bar_h + 8 - (dcy - deg_r - 30))

def svg(moss_top, moss_mid, moss_bot, leaf_a, leaf_b, earth_a, earth_b, deg, title=True, height=56):
    w = vb[2] / vb[3] * height
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}" width="{w:.0f}" height="{height}">
  {'<title>Moss</title>' if title else ''}
  <defs>
    <linearGradient id="moss" x1="0" y1="{top - W/2:.0f}" x2="0" y2="{base:.0f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{moss_top}"/><stop offset="0.5" stop-color="{moss_mid}"/><stop offset="1" stop-color="{moss_bot}"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{leaf_a}"/><stop offset="1" stop-color="{leaf_b}"/></linearGradient>
    <linearGradient id="earth" x1="0" y1="{bar_y:.0f}" x2="0" y2="{bar_y + bar_h:.0f}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{earth_a}"/><stop offset="1" stop-color="{earth_b}"/></linearGradient>
  </defs>
  <!-- m o s s: the icon's m, and letters drawn with the same stroke -->
  <path d="{mp} {op}" fill="none" stroke="url(#moss)" stroke-width="{W}" stroke-linejoin="round"/>
  <path d="{s1} {s2}" fill="none" stroke="url(#moss)" stroke-width="{W}" stroke-linecap="round"/>
  <!-- the leaf, as on the icon -->
  {leaf.replace('{leaf}', 'url(#leaf)')}
  <!-- the degree sign -->
  <circle cx="{dcx:.1f}" cy="{dcy:.1f}" r="{deg_r}" fill="none" stroke="{deg}" stroke-width="{deg_w}"/>
  <!-- the ground -->
  <rect x="{x0:.1f}" y="{bar_y:.1f}" width="{x1 - x0:.1f}" height="{bar_h:.1f}" rx="{bar_h/2:.1f}" fill="url(#earth)"/>
</svg>
'''
dark = svg('#C8E1BD', '#8FB996', '#557F5C', '#9CC59F', '#D6ECCB', '#A3896F', '#584637', '#9CC59F')
light = svg('#8FB996', '#5E8A65', '#3F6447', '#6E9B73', '#A9CDA0', '#A3896F', '#6B5644', '#6E9B73')
open('wordmark-dark.svg', 'w').write(dark)
open('wordmark-light.svg', 'w').write(light)
print('viewBox', ' '.join(f'{v:.1f}' for v in vb))
print('M', mp); print('O', op); print('S1', s1); print('S2', s2)
print('deg', dcx, dcy, 'bar', x0, bar_y, x1 - x0, bar_h, 'leaf', (722-294)*k, base + (392-682)*k, k)
