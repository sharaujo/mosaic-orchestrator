# mosAIco brand

**Name:** mosAIco, with `AI` capitalized everywhere the product name is shown.

**Tagline:** Many intelligences. One direction.

The modular mark represents independent terminals and agents in one coordinated workspace. Its source is [`src/assets/mosaico-mark.svg`](../src/assets/mosaico-mark.svg). The wordmark uses “mos” and “co” in the foreground color and “AI” in teal. It is rendered with the app's existing type system; no font installation is needed.

| Color | Hex | Role |
|---|---|---|
| Graphite | `#171A1D` | Main dark surface |
| Teal | `#36BFA6` | Primary accent and mark |
| Violet | `#9180D4` | Secondary accent and mark |
| Amber | `#E3B35A` | Secondary accent and mark |
| Ivory | `#F3F1EA` | Light foreground and surface |

The built-in `mosaico` theme lives in [`src/styles/theme.css`](../src/styles/theme.css); component styles must use its tokens. The theme is the default for new profiles. The icon uses the same palette across desktop, taskbar, remote companion, and installer artwork. Existing profiles keep their selected theme and icon.

Run [`scripts/generate-mosaico-branding.ps1`](../scripts/generate-mosaico-branding.ps1) to regenerate the PNG, ICO, ICNS, and NSIS BMP assets from the vector geometry. This only updates source assets; it does not build an installer.

Source authorship notices are in [`NOTICE`](../NOTICE). The mosAIco brand is described in [`TRADEMARK.md`](../TRADEMARK.md).

Third-party visual provenance, neutral integration icons and publication limits are recorded in
[`BRAND-ASSETS.md`](BRAND-ASSETS.md); the per-file inventory is [`brand-assets.json`](brand-assets.json).
