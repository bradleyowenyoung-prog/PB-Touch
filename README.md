# PB Touch

A full-screen iPhone wrapper for [PB Ranked](https://ranked.pokemonbattlegrounds.com/)
(Pokémon Battlegrounds), with custom on-screen controls in development.

Unofficial fan project, not affiliated with the PB Ranked developers, Nintendo,
Game Freak or The Pokémon Company. It loads the live website; no game code or
assets are included.

## Status — build 1 (diagnostics)

- Landscape full screen: no status bar, home indicator auto-hides, edge swipes need a second swipe.
- Login is kept between launches. **Use Discord sign-in** (Google blocks sign-in inside apps).
- ⚙︎ button (top centre; 3-finger tap hides or shows it):
  - **Export diagnostics**: saves `diagnostics.json`, `native.json`, `page.html` and `screenshot.png`
    to a zip and opens the share sheet. Exports are also kept in the Files app → On My iPhone → PB Touch.
    Tokens and long secret-looking values in storage are left out.
  - **Virtual controller test**: on-screen stick and buttons presented to the game as a standard gamepad,
    with a readout showing whether the game is polling it.

## Planned (build 2)

Hide PB's own buttons, stretch the arena, then add:
- analogue stick (movement)
- radial move button: press, drag towards a move, release
- Dodge, Auto/Manual, Mega
- quick Pokémon switching

## Building

Every push to `main` builds an unsigned `PBTouch.ipa` on a GitHub macOS runner and publishes it
as the `latest` release. Sign and install it with AltStore, SideStore, Sideloadly or similar.
Locally on a Mac: `bash scripts/build.sh`.
