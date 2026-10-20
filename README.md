# supabase-rn-auth-lab

A small Expo app that reproduces open `supabase-js` auth and realtime issues on a
real React Native runtime (Hermes), against a local Supabase stack.

The Supabase client in `src/lib/supabase.ts` uses the setup from Supabase's React
Native docs: AsyncStorage, `persistSession`, `autoRefreshToken`, and AppState-driven
`startAutoRefresh` / `stopAutoRefresh`. Its `fetch` is wrapped so every
`/auth/v1/token` request is counted and logged.

## Results — 2026-10-20

Environment (printed by the app): iOS 26.5 simulator · React Native 0.88.0 · Hermes ·
Expo SDK 58 (Expo Go) · `@supabase/supabase-js` 2.118.0 · local Supabase CLI 2.109.1.
Raw logs: [`results/2026-10-20-ios.md`](results/2026-10-20-ios.md).

| Issue | Scenario | Result |
|---|---|---|
| [#1730](https://github.com/supabase/supabase-js/issues/1730) | Cold start, a new client subscribes to `postgres_changes` on an RLS table while its session is still loading from AsyncStorage | **Reproduced 3/3.** Channel reports `SUBSCRIBED`; the INSERT event arrives with an empty record and `errors: ["Error 401: Unauthorized"]` |
| #1730 workaround | Same, plus `realtime.setAuth(session.access_token)` in `onAuthStateChange` | **Still fails 3/3.** The workaround from the issue does not help on 2.118.0 |
| #1730 control | Subscribe after the session is already loaded | Passes 7/7 (`naive` ×5, `after-session` ×1, `workaround` ×1) |
| [#2767](https://github.com/supabase/supabase-js/issues/2767) | Refresh fails offline, network returns | **Reproduced.** Offline: 8 `/token` attempts over 25.6 s. Online: `refreshSession()` and `startAutoRefresh()` send **0** requests. First successful refresh 56.3 s after the network came back |
| [#2613](https://github.com/supabase/supabase-js/issues/2613) | phoenix `visibilitychange` reconnect without re-auth | **Not applicable to React Native.** phoenix registers that listener only if `window.addEventListener` exists; the app logs `typeof window.addEventListener === "undefined"` on Hermes |

Not yet exercised: the RN analog of #2613 (AppState background longer than the JWT
lifetime, then foreground and check the rejoin token). The screen supports it via
`?action=insert`; it needs a >5 minute background run.

Notes:
- #1730's `fresh-client` mode matters. If the screen subscribes after the app-wide
  client has already restored its session, the bug does not show. A real app's first
  screen subscribes during that window.
- The #2767 offline state is simulated in `fetch` (it throws `TypeError("Network
  request failed")`, what RN's fetch throws offline). For a real outage, stop the
  auth container and drive refreshes with `?action=refresh`.
- 2.118.0 logs a deprecation warning for the `lock` option that the RN docs still
  show, so the client here omits it.

## Run it

```sh
npm install
supabase start -x studio,imgproxy,vector,logflare,supavisor,edge-runtime,storage-api,mailpit
cp .env.example .env        # local default keys, ports 544xx
npx expo start --ios        # opens Expo Go on the booted simulator
```

Then tap **Sign in test user**, open a scenario, and watch the log on screen (also in
the Metro terminal with a `[lab]` prefix).

Driving it from the terminal:

```sh
xcrun simctl openurl booted "exp://$(ipconfig getifaddr en0):8081/--/?action=signin&t=1"
scripts/cold-start.sh "/realtime?mode=fresh-client&auto=1"    # #1730
xcrun simctl openurl booted "exp://$(ipconfig getifaddr en0):8081/--/refresh?auto=1"   # #2767
```

`supabase/config.toml` sets `jwt_expiry = 300` and moves ports to 544xx so it can run
next to another local project. A value below auth-js's 90 s refresh margin makes the
client refresh on every call and muddies the results.

## Layout

```
src/app/_layout.tsx      Stack navigator (expo-router: every file in src/app is a screen)
src/app/index.tsx        sign in/out, environment info, cold-start routing
src/app/refresh.tsx      #2767 scenario
src/app/realtime.tsx     #1730 scenario (modes: fresh-client, fresh-client-workaround, naive, after-session, workaround)
src/lib/supabase.ts      client factory, instrumented fetch, AppState hook
src/lib/log.ts           in-memory event log (screen + Metro console)
supabase/migrations/     messages table, owner-only RLS, added to supabase_realtime
scripts/cold-start.sh    relaunch Expo Go straight into a scenario
```
