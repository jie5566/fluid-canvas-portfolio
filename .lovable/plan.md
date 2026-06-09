## Contact page tweaks

Target: `ContactView` in `src/components/JvisionPortfolio.tsx` (around lines 697–747).

### 1. Move Network + LinkedIn to top-left
- Remove the current block at `absolute bottom-8 right-8` (lines 728–739).
- Add the same block at `absolute top-8 left-8 sm:top-10 sm:left-10`, kept above the WebGL canvas (`z-20`).
- Add `mix-blend-difference` so it stays readable over the animated background, matching the [ CLOSE ] button.

### 2. Make text white and clearly visible
The WebGL background washes out the low-opacity labels. Bump all Contact-page secondary text to full white / high contrast:
- `Stockholm, Sweden` (bottom-left): drop `opacity-70`, keep `text-white`, add `mix-blend-difference` and a subtle text-shadow for legibility.
- Network label: drop `opacity-70`, render in solid white.
- LinkedIn link: keep the CTA blue accent but bump weight/contrast (no opacity dimming).
- Email button + "[ COPIED ]" hint: already white/CTA — leave as is.

No other views are touched. No logic, routing, or data changes.
