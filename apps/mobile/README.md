# Pressure Atlas mobile shell

This Expo app presents the existing Pressure Atlas/OpenFront client as a
full-screen game surface. The map, WebGL renderer, networking, and gameplay stay
in the web application. Native React Native chrome supplies app lifecycle,
session persistence, haptics, connection recovery, and a small command deck.

The boundary is deliberate: the game remains visually pixelated and unchanged,
while the app controls use the tactile, material-heavy Pressure Atlas design.
There is no page-like outer scrolling.

The app icon was generated specifically for Pressure Atlas with the built-in
image generation workflow: an original brass compass over an emerald globe in
a mahogany instrument bezel. Its project master is
`assets/pressure-atlas-icon.png`.

## Run on a phone now

1. Keep the Pressure Atlas web development server running on port `9000`.
2. Copy `.env.example` to `.env.local` if the workstation IP has changed, then
   update `EXPO_PUBLIC_GAME_URL`.
3. From the repository root, run `npm run mobile:start`.
4. Open the resulting QR code with Expo Go on iOS or Android.

The committed fallback is `http://192.168.2.118:9000/`. For off-LAN testing,
set `EXPO_PUBLIC_GAME_URL=https://atlas-dev.sightings.today/` before starting
Metro. Cloudflare Access can authenticate inside the persistent WebView.

## Architecture contract

- The WebView is full bleed, disables bounce/overscroll, and retains cookies,
  DOM storage, and cache between launches.
- App foreground/background transitions are delivered to the web client as the
  `pressureatlas:app-state` browser event.
- The presence of the shell is delivered as `pressureatlas:native-ready`; the
  same metadata is exposed at `window.__PRESSURE_ATLAS_NATIVE__`.
- Existing gameplay input is not intercepted except beneath the single native
  command-deck trigger.
- External source/license material opens in the system browser.

## Development builds and literal platform controls

The current deck uses React Native `Pressable`, which renders through native
iOS/Android views and works in Expo Go. The project also includes
`expo-dev-client` and an EAS development profile. That gives the next phase a
clean place for an Expo Module whose Swift side hosts `UIButton`/UIKit controls
and whose Kotlin side hosts Android platform widgets.

Create those installable development builds with:

```sh
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android
```

iOS cloud builds require the owner's Expo and Apple developer authentication;
Android builds require Expo authentication and signing credentials. No account
or signing identity is committed to this repository.

Before a store release, change the production URL to the final HTTPS game
domain and remove the two cleartext-development exceptions from `app.json`.

## Verification

```sh
npm run typecheck
npx expo-doctor
npx expo export --platform android
```
