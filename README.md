# PB Touch

A full-screen iPhone wrapper for [PB Ranked](https://ranked.pokemonbattlegrounds.com/)
(Pokémon Battlegrounds), with custom on-screen controls in development.

Unofficial fan project, not affiliated with the PB Ranked developers, Nintendo,
Game Freak or The Pokémon Company. It loads the live website; no game code or
assets are included.

## Status — build 2 (custom battle controls)

- Landscape full screen: no status bar, home indicator auto-hides, edge swipes need a second swipe.
- Login is kept between launches. **Use Discord sign-in** (Google blocks sign-in inside apps).
- ⚙︎ button (top centre; 3-finger tap hides or shows it):
  - **Export diagnostics**: saves `diagnostics.json`, `native.json`, `page.html` and `screenshot.png`
    to a zip and opens the share sheet. Exports are also kept in the Files app → On My iPhone → PB Touch.
    Tokens and long secret-looking values in storage are left out.
  - **Virtual controller test**: on-screen stick and buttons presented to the game as a standard gamepad,
    with a readout showing whether the game is polling it.

## Battle layout (build 2)

In a battle the arena fills the screen height and PB's own buttons are moved off screen (they keep working underneath):
- **Left:** PB's analogue stick (touching it on Auto switches to Manual), bench strip top-left (tap to switch).
- **Right:** radial move button (tap a quarter, or press and drag towards one, release to use it; quarters show the
  move name, type colour and cooldown; a move in range glows with a green dot, out of range is dimmed and striped), Dodge above it, Auto/Manual and Mega pills top-right.
- ⚙︎ menu: controls on/off, arena size (full screen, top-aligned / 100% / 92% / 84%), **Edit layout** (drag any control to move it,
  pinch or − / + to resize it, per control), all-buttons size, controls opacity, move input (controller buttons or taps).

## Building

Every push to `main` builds an unsigned `PBTouch.ipa` on a GitHub macOS runner and publishes it
as the `latest` release. Sign and install it with AltStore, SideStore, Sideloadly or similar.
Locally on a Mac: `bash scripts/build.sh`.
