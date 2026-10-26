// Ranked games and weekly leagues: the numbers the app shows. The rules
// themselves run on the server (supabase/migrations/*_ranked_and_leagues.sql).

/** Same as private.ranked_rules() on the server. */
export const RANKED_ROUNDS = 10;
export const RANKED_SECONDS = 30;

/** Same as private.league_rules() on the server. */
export const LEAGUE_PROMOTE = 7;
export const LEAGUE_DEMOTE = 5;

/** League tiers, lowest first: Explorer, Navigator, Cartographer, Geographer, Atlas. */
export const TIER_COUNT = 5;
export const TIER_ICONS = ['compass-outline', 'sail-boat', 'map-outline', 'earth', 'crown-outline'] as const;

export const clampTier = (tier: number) => Math.min(TIER_COUNT - 1, Math.max(0, tier));

/** The code inside a Supabase error message ("profile_required"), or "offline". */
export function errorCode(message: string | undefined): string {
  const m = message?.match(/^[a-z_]+$/);
  return m ? m[0] : 'offline';
}

/** Hours left until `endsAt`, for "ends in…". */
export const hoursLeft = (endsAt: Date, now: Date) => (endsAt.getTime() - now.getTime()) / 3_600_000;
