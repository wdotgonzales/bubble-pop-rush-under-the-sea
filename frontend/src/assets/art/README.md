# Art

Images the screens use. Bitmaps are small JPEG/WebP; the characters and icons are SVG.

| File | What | Figma node |
| --- | --- | --- |
| `bg-portrait.jpg` | Underwater background, phone | `37:4372` (M01 Start screen) |
| `bg-landscape-start.jpg` | Underwater background, desktop start (the centre column's edges are blended away, see DECISIONS.md) | `6:2688` (D01) |
| `bg-landscape-over.jpg` | Desktop game over background, includes the big shell | `19:287` (D03) |
| `shell-portrait.webp` | Pearlescent shell behind the phone game over panel | `39:178` (M03) |
| `turtle-start.svg` | Sea turtle on the start screen | `37:4544` |
| `turtle-over.svg` | Sea turtle with aqua glow on the game over screen | `39:228` |
| `splash-icon.svg` | Splash icon on the SHARE button | `39:291` |
| `settings-button.svg` | Gear button (the sound switch) | `37:4535` |

The three backgrounds and the shell were exported at 1x, which is enough for soft gradients.
Everything with edges (turtle, icons) is vector. Buttons, panels, titles, bubbles and the
leaderboard are CSS and live text, not images.

Figma file: https://www.figma.com/design/4x8XKjW811d7EmXo8o5MI7
