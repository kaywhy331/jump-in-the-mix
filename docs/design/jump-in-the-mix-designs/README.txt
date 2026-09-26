Jump in the Mix: design export
================================

Open index.html. It lists every screen, light and dark, grouped by mobile, tablet, desktop and landing page.

screens/         One standalone HTML file per screen. No build step, no runtime; they only load two Google Fonts
                 (Instrument Sans and Newsreader). All styling is inline, so a developer can read exact sizes,
                 spacing and colors straight from the markup or the browser inspector.
tokens.css       Colors, fonts and radii as CSS variables. Dark mode follows the system and can be forced with
                 <html data-theme="dark"> or data-theme="light".
canvas-source/   The original design-canvas files (.dc.html + canvas.json).

Notes
- Names, numbers and messages in the screens are sample data.
- The logo is a placeholder speech bubble; swap in the real mark.
- Screens are fixed-size mockups (390, 834, 1194 and 1920 wide), not responsive pages.
