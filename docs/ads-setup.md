# Ads setup

What to set up outside the code so Atlas Go shows real ads, the same way as
Vocablo (`enriqueazo/e-e`, `docs/ads-setup.md`). All of it works without
the paid Apple and Google developer accounts.

## How the ads work

- **Rewarded ads** give a hint: in the Shop ("Watch an ad", 5 a day) and,
  once your hints run out, in a game ("Watch an ad: +1 hint"). Closing the ad
  early gives nothing.
- **Full-screen ads** come between questions in the solo modes, per mode and
  per day: the first one after 3 answers; after that, each visit to a mode
  counts from zero, with an ad after 6 answers, then 10, 15, 20, 25 and every
  30. The more someone plays, the fewer ads they see. A watched rewarded ad
  pushes the next full-screen ad a gap further away.
  - In Countries, Capitals, Silhouettes and Flags each answer counts; the ad
    shows before the next question.
  - In Neighbours each country counts; the ad shows before the next one.
  - In Complete the map and Complete a country each place painted counts,
    and the ad waits until you leave the map, so it never runs against the
    clock.
  - Never in Ranked, duels or the Map of the day, and never with **No ads**.
- **No ads** (in the Shop) turns off the full-screen ads, and the rewarded
  ad's hint comes without the ad.
- Where the build has no AdMob (web, Expo Go, older builds) a test ad stands
  in on the same schedule.

## 1. AdMob (Google's ads)

Until this is done the app shows Google's sample ads, which never pay and
never call our server, so the test shop gives the hint itself.

1. Sign in at https://admob.google.com with the Google account that will
   receive the money, and accept the terms (the same account as Vocablo's
   is fine).
2. **Apps › Add app**, twice: Android and iOS. Answer "No" to "Is the app
   listed on a supported app store?" and name both "Atlas Go".
3. In each app, **Ad units › Add ad unit**:
   - **Rewarded**, named `Hint for an ad`. Reward: amount `1`, item `hint`.
     Open **Server-side verification** and paste
     `https://<project>.supabase.co/functions/v1/admob-reward`
     (the atlas-go-prod URL; the dev one for testing first).
   - **Interstitial**, named `Between questions`.
4. Send me, for each platform, the **App ID** (`ca-app-pub-…~…`) and both
   **ad unit IDs** (`ca-app-pub-…/…`). They are not secret. I put the app IDs
   in `app.json` and the unit IDs in `src/ads/config.ts`.
5. Before the first build with our own units, add your phone as a **test
   device** (AdMob › Settings › Test devices), or send me the id the app
   prints in the logs ("Use RequestConfiguration… to get test ads on this
   device") and I add it to `TEST_DEVICE_IDS`. Tapping real ads on your own
   phone can get the AdMob account banned.
6. **Privacy & messaging › GDPR**: create a message for the EU and UK (the
   default Google consent form is fine) and publish it for Atlas Go. Without
   a published GDPR message, users in the EU get no ads. Settings then shows
   "Ad privacy" to change the choice.

## 2. Server

Needs the Supabase projects from the README ("Online play").

```bash
npx supabase link --project-ref <dev or prod ref>
npx supabase db push                                   # adds the ad reward functions
npx supabase functions deploy admob-reward --no-verify-jwt
```

Then in AdMob, on the rewarded ad unit, press **Verify URL**: the function
answers `ok: no player` when it works. Its logs are in the Supabase dashboard
under Edge Functions › admob-reward.

Until Supabase is set up, the wallet lives on the phone and a watched ad
adds the hint there.

## 3. A new development build

The ads library is native code, so the app needs a new build:

- Android: `npx eas-cli@latest build --profile development --platform android`
- iPhone: needs the Apple Developer account for a device build.

Expo Go and older builds keep working, with the test ads instead of Google's.

## Later, with the paid accounts

- Link each AdMob app to its store listing once the app is published
  (AdMob › App settings › Link to store). Unlinked apps get few or no real ads.
- Put an `app-ads.txt` file on the website listed in the stores, with the line
  AdMob shows under **Apps › app-ads.txt**.
- A privacy policy that mentions AdMob, as Vocablo's does
  (`docs/legal/privacidad.md` there).
- Add payment and tax details in AdMob › Payments.
