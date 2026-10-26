-- Step 2: ranked games, weekly leagues, rankings and invite-code groups, as
-- in Vocablo.
--
-- Ranked games are run by the server: it picks each question (the mode, the
-- place and the three options), times it and adds up the points, so a
-- modified app can't send a made-up score or pick easy questions. The app
-- only draws the question with its own map, flags and silhouettes.
-- Everything here is reached through the functions at the bottom; the tables
-- have row level security on and no policies, so players can't read or write
-- them directly.

create schema if not exists private;

-- Settings ------------------------------------------------------------------

-- The version of the places below. The app sends its own (RANKED_DATA in
-- src/data/ranked.ts) when a game starts, so an outdated app can't play.
create table public.ranked_config (
  id boolean primary key default true check (id),
  data text not null
);
insert into public.ranked_config (data) values ('');

-- The places a ranked game can ask about, loaded by a generated migration
-- (scripts/build-ranked-places.mjs): each with its difficulty tier, where it
-- is, and which modes can show it.
create table public.quiz_places (
  iso text primary key check (iso ~ '^[A-Z]{2}$'),
  tier smallint not null check (tier between 1 and 5),
  region text not null,
  continent text not null,
  capital boolean not null, -- has a capital to ask about
  flag boolean not null,
  silhouette boolean not null
);

-- Same rules as the app (src/game/leagues.ts): 10 questions of 30 seconds
-- (plus a few seconds' grace for the connection), starting at level 1 of 5.
create function private.ranked_rules()
returns table (rounds int, seconds int, grace int, start_level int, top_level int)
language sql
immutable
set search_path = ''
as $$
  select 10, 30, 5, 1, 5;
$$;

-- The quiz modes take turns, as in the map of the day.
create function private.ranked_mode(p_round int)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['countries', 'flags', 'silhouette', 'capitals'])[p_round % 4 + 1];
$$;

-- Weekly leagues: about 30 players of the same tier. Each week the top 7 go
-- up a tier and the bottom 5 go down.
create function private.league_rules()
returns table (size int, promote int, demote int, top_tier int)
language sql
immutable
set search_path = ''
as $$
  select 30, 7, 5, 4;
$$;

-- Weeks start on Monday, 00:00 UTC.
create function private.current_week()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', now() at time zone 'UTC')::date;
$$;

-- Ranked games ----------------------------------------------------------------

create table public.ranked_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  level smallint not null,
  round smallint not null default 0, -- questions answered so far
  score integer not null default 0,
  correct smallint not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ranked_games_user on public.ranked_games (user_id, started_at desc);

-- One row per question shown. Which option is right is only told once the
-- player has answered.
create table public.ranked_items (
  game_id uuid not null references public.ranked_games (id) on delete cascade,
  round smallint not null,
  mode text not null,
  iso text not null,
  options text[] not null,
  tier smallint not null,
  shown_at timestamptz not null default now(),
  deadline timestamptz not null,
  answered_at timestamptz,
  chosen text,
  correct boolean,
  points smallint not null default 0,
  primary key (game_id, round)
);

-- Leagues and totals ------------------------------------------------------------

-- The player's tier: 0 Explorer, 1 Navigator, 2 Cartographer, 3 Geographer, 4 Atlas.
create table public.player_league (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier smallint not null default 0 check (tier between 0 and 4),
  applied_week date, -- the last week whose result is already in `tier`
  last_change smallint not null default 0 -- what that week did: +1 up, -1 down, 0 stayed
);

create table public.leagues (
  id bigint generated always as identity primary key,
  week date not null,
  tier smallint not null,
  created_at timestamptz not null default now()
);
create index leagues_week_tier on public.leagues (week, tier);

create table public.league_members (
  week date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  league_id bigint not null references public.leagues (id) on delete cascade,
  points integer not null default 0,
  games integer not null default 0,
  reached_at timestamptz not null default now(), -- breaks ties: who got there first
  primary key (week, user_id)
);
create index league_members_league on public.league_members (league_id, points desc);
create index league_members_week on public.league_members (week, points desc);

-- All-time ranked points.
create table public.player_totals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points bigint not null default 0,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);
create index player_totals_points on public.player_totals (points desc);

-- Groups --------------------------------------------------------------------

-- Private rankings among friends, joined with a 6-character code.
create table public.player_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 30),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.player_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

alter table public.ranked_config enable row level security;
alter table public.quiz_places enable row level security;
alter table public.ranked_games enable row level security;
alter table public.ranked_items enable row level security;
alter table public.player_league enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.player_totals enable row level security;
alter table public.player_groups enable row level security;
alter table public.group_members enable row level security;

-- Helpers (not callable from the app) ---------------------------------------

create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  return auth.uid();
end;
$$;

create function private.require_profile()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  return uid;
end;
$$;

-- A question for `p_mode` near `p_level`, avoiding the places in `p_skip`:
-- the place, and three options in the order shown (the place and two others,
-- closer to it as the level climbs, like src/game/engine.ts).
create function private.pick_question(p_mode text, p_level int, p_skip text[])
returns table (iso text, tier smallint, options text[])
language plpgsql
volatile
set search_path = ''
as $$
declare
  target public.quiz_places;
  want int;
  near boolean := p_level >= 3;
begin
  -- Mostly the level's own tier; now and then an easier one.
  want := case when random() < 0.65 then p_level else 1 + floor(random() * p_level)::int end;
  select q.* into target from public.quiz_places q
  where case p_mode when 'capitals' then q.capital when 'flags' then q.flag when 'silhouette' then q.silhouette else true end
    and q.iso <> all (p_skip)
  order by (q.tier = want) desc, (q.tier <= p_level) desc, abs(q.tier - want), random()
  limit 1;
  if target.iso is null then
    raise exception 'no_places';
  end if;

  return query
  select target.iso, target.tier, array_agg(o.iso order by random())
  from (
    (select target.iso)
    union all
    (select d.iso from public.quiz_places d
     where d.iso <> target.iso
       and (p_mode <> 'capitals' or d.capital)
       and d.tier <= greatest(p_level, target.tier) + 1
     order by random() * 2
       + case
           when d.region = target.region then case when near then 4 else 2 end
           when d.continent = target.continent then case when near then 2 else 1.5 end
           else 0
         end
       + case when abs(d.tier - target.tier) <= 1 then 1 else 0 end desc
     limit 2)
  ) o;
end;
$$;

-- +1 if this place in a league of `members` players goes up, -1 if it goes
-- down, 0 if it stays.
create function private.league_zone(place int, members int, tier int, points int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when place <= r.promote and points > 0 and tier < r.top_tier then 1
    when place > greatest(r.promote, members - r.demote) and tier > 0 then -1
    else 0
  end
  from private.league_rules() r;
$$;

-- The player's tier for `week`, first applying the result of the last week
-- they played, if that isn't done yet.
create function private.league_tier(p_user uuid, p_week date)
returns smallint
language plpgsql
set search_path = ''
as $$
declare
  pl public.player_league;
  prev public.league_members;
  place int;
  members int;
  change int;
begin
  insert into public.player_league (user_id) values (p_user) on conflict do nothing;
  select * into pl from public.player_league where user_id = p_user for update;

  select * into prev from public.league_members
  where user_id = p_user and week < p_week
  order by week desc limit 1;

  if prev.league_id is not null and (pl.applied_week is null or pl.applied_week < prev.week) then
    select count(*) into members from public.league_members where league_id = prev.league_id;
    select count(*) + 1 into place from public.league_members o
    where o.league_id = prev.league_id
      and (o.points > prev.points or (o.points = prev.points and o.reached_at < prev.reached_at));
    change := private.league_zone(place, members, pl.tier, prev.points);
    update public.player_league
    set tier = tier + change, applied_week = prev.week, last_change = change
    where user_id = p_user
    returning * into pl;
  end if;
  return pl.tier;
end;
$$;

-- Puts the player in a league of their tier for `week` (once per week).
create function private.join_league(p_user uuid, p_week date)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  lid bigint;
  t smallint;
begin
  select league_id into lid from public.league_members where week = p_week and user_id = p_user;
  if found then
    return lid;
  end if;

  t := private.league_tier(p_user, p_week);
  -- One player at a time fills the leagues of a tier, so none goes over size.
  perform pg_advisory_xact_lock(hashtext('league ' || p_week::text), t);

  select l.id into lid from public.leagues l
  where l.week = p_week and l.tier = t
    and (select count(*) from public.league_members m where m.league_id = l.id) < (select size from private.league_rules())
  order by l.id
  limit 1;
  if lid is null then
    insert into public.leagues (week, tier) values (p_week, t) returning id into lid;
  end if;

  insert into public.league_members (week, user_id, league_id) values (p_week, p_user, lid);
  return lid;
end;
$$;

-- Scores the current question of a game: `p_iso` is the place the player
-- picked, null when time ran out. Harder places are worth more (10 × tier).
create function private.settle_question(p_game public.ranked_games, p_iso text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r record;
  item public.ranked_items;
  late boolean;
  is_correct boolean;
  pts int;
  done boolean;
begin
  select * into r from private.ranked_rules();
  select * into item from public.ranked_items
  where game_id = p_game.id and round = p_game.round and answered_at is null
  for update;
  if not found then
    raise exception 'no_question';
  end if;

  late := now() > item.deadline + make_interval(secs => r.grace);
  is_correct := not late and p_iso is not null and p_iso = item.iso;
  pts := case when is_correct then item.tier * 10 else 0 end;

  update public.ranked_items
  set answered_at = now(), chosen = p_iso, correct = is_correct, points = pts
  where game_id = item.game_id and round = item.round;

  done := p_game.round + 1 >= r.rounds;
  update public.ranked_games
  set round = round + 1,
      score = score + pts,
      correct = correct + is_correct::int,
      level = least(r.top_level, greatest(1, level + case when is_correct then 1 else -1 end)),
      finished_at = case when done then now() end
  where id = p_game.id;

  if pts > 0 then
    update public.league_members
    set points = points + pts, reached_at = now()
    where week = p_game.week and user_id = p_game.user_id;
    update public.player_totals
    set points = points + pts, updated_at = now()
    where user_id = p_game.user_id;
  end if;

  return jsonb_build_object(
    'correct', is_correct,
    'late', late,
    'points', pts,
    'answer', item.iso,
    'score', p_game.score + pts,
    'done', done
  );
end;
$$;

-- Ranked game functions -------------------------------------------------------

-- Starts a ranked game. Needs a profile (the name shown in the rankings) and
-- the same places as the server.
create function public.start_ranked_game(p_data text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  r record;
  w date := private.current_week();
  gid uuid;
begin
  if p_data is distinct from (select data from public.ranked_config) then
    raise exception 'data_mismatch';
  end if;
  select * into r from private.ranked_rules();

  -- A new game ends any game left half played.
  update public.ranked_games set finished_at = now() where user_id = uid and finished_at is null;

  perform private.join_league(uid, w);
  insert into public.ranked_games (user_id, week, level)
  values (uid, w, r.start_level)
  returning id into gid;

  update public.league_members set games = games + 1 where week = w and user_id = uid;
  insert into public.player_totals (user_id, games) values (uid, 1)
  on conflict (user_id) do update set games = public.player_totals.games + 1, updated_at = now();

  return jsonb_build_object('id', gid, 'rounds', r.rounds, 'seconds', r.seconds);
end;
$$;

-- The question to answer now. Asking again before answering returns the same
-- question; one whose time ran out counts as a miss.
create function public.ranked_next(p_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  r record;
  g public.ranked_games;
  item public.ranked_items;
  q record;
  m text;
begin
  select * into r from private.ranked_rules();
  select * into g from public.ranked_games where id = p_game and user_id = uid for update;
  if not found then
    raise exception 'game_not_found';
  end if;

  if g.finished_at is null then
    select * into item from public.ranked_items where game_id = g.id and round = g.round;
    if found and item.answered_at is null then
      if now() <= item.deadline + make_interval(secs => r.grace) then
        return jsonb_build_object(
          'done', false,
          'round', item.round,
          'mode', item.mode,
          'iso', item.iso,
          'options', to_jsonb(item.options),
          'level', g.level,
          'ms_left', greatest(0, floor(extract(epoch from item.deadline - now()) * 1000))::int
        );
      end if;
      perform private.settle_question(g, null);
      select * into g from public.ranked_games where id = p_game;
    end if;
  end if;

  if g.finished_at is not null then
    return jsonb_build_object('done', true, 'score', g.score, 'correct', g.correct, 'played', g.round);
  end if;

  m := private.ranked_mode(g.round);
  select * into q from private.pick_question(
    m, g.level, coalesce((select array_agg(i.iso) from public.ranked_items i where i.game_id = g.id), '{}')
  );

  insert into public.ranked_items (game_id, round, mode, iso, options, tier, deadline)
  values (g.id, g.round, m, q.iso, q.options, q.tier, now() + make_interval(secs => r.seconds))
  returning * into item;

  return jsonb_build_object(
    'done', false,
    'round', item.round,
    'mode', item.mode,
    'iso', item.iso,
    'options', to_jsonb(item.options),
    'level', g.level,
    'ms_left', r.seconds * 1000
  );
end;
$$;

-- Answers the current question with the place the player picked (null: time ran out).
create function public.ranked_answer(p_game uuid, p_iso text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  g public.ranked_games;
begin
  select * into g from public.ranked_games where id = p_game and user_id = uid and finished_at is null for update;
  if not found then
    raise exception 'game_not_found';
  end if;
  return private.settle_question(g, p_iso);
end;
$$;

-- League and ranking functions ------------------------------------------------

-- The player's league this week: tier, when the week ends, the table with who
-- goes up and down, and what last week's result did.
create function public.my_league()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  w date := private.current_week();
  t smallint := private.league_tier(uid, w);
  pl public.player_league;
  lid bigint;
  members int;
  standings jsonb;
begin
  select * into pl from public.player_league where user_id = uid;
  select league_id into lid from public.league_members where week = w and user_id = uid;

  if lid is not null then
    select count(*) into members from public.league_members where league_id = lid;
    select jsonb_agg(jsonb_build_object(
             'rank', s.place,
             'nickname', s.nickname,
             'country', s.country,
             'points', s.points,
             'me', s.user_id = uid,
             'zone', private.league_zone(s.place::int, members, t, s.points)
           ) order by s.place)
    into standings
    from (
      select m.user_id, m.points, coalesce(p.nickname, '—') as nickname, p.country,
             row_number() over (order by m.points desc, m.reached_at) as place
      from public.league_members m
      left join public.profiles p on p.id = m.user_id
      where m.league_id = lid
    ) s;
  end if;

  return jsonb_build_object(
    'tier', t,
    'ends_at', (w + 7)::timestamp at time zone 'UTC',
    'joined', lid is not null,
    'last_change', case when pl.applied_week = w - 7 then pl.last_change end,
    'rows', coalesce(standings, '[]'::jsonb)
  );
end;
$$;

-- A ranking table: the top 50 and the player's own place.
--   p_scope: 'global', 'country' (the player's) or 'group' (p_group)
--   p_period: 'week' (this week's league points) or 'all' (all-time)
create function public.ranking(p_scope text, p_period text, p_group uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  w date := private.current_week();
  my_country text;
  result jsonb;
begin
  if p_scope not in ('global', 'country', 'group') or p_period not in ('week', 'all') then
    raise exception 'bad_scope';
  end if;
  if p_scope = 'group' and not exists (
    select 1 from public.group_members where group_id = p_group and user_id = uid
  ) then
    raise exception 'not_a_member';
  end if;
  select country into my_country from public.profiles where id = uid;

  with base as (
    select m.user_id, m.points::bigint as points from public.league_members m
    where p_period = 'week' and m.week = w
    union all
    select t.user_id, t.points from public.player_totals t
    where p_period = 'all'
  ),
  scoped as (
    select b.user_id, b.points, p.nickname, p.country
    from base b
    join public.profiles p on p.id = b.user_id
    where case p_scope
      when 'global' then true
      when 'country' then p.country = my_country
      else exists (select 1 from public.group_members g where g.group_id = p_group and g.user_id = b.user_id)
    end
  ),
  ranked as (
    select s.*,
           rank() over (order by s.points desc) as place,
           row_number() over (order by s.points desc, lower(s.nickname)) as n
    from scoped s
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', place, 'nickname', nickname, 'country', country,
               'points', points, 'me', user_id = uid
             ) order by n)
      from ranked where n <= 50
    ), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', place, 'points', points) from ranked where user_id = uid),
    'total', (select count(*) from ranked)
  ) into result;
  return result;
end;
$$;

-- Group functions ---------------------------------------------------------------

-- Creates a group and joins it. Returns its id, name and invite code.
create function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  new_code text;
  gid uuid;
begin
  if char_length(clean) not between 3 and 30 then
    raise exception 'bad_name';
  end if;
  if (select count(*) from public.group_members where user_id = uid) >= 10 then
    raise exception 'too_many_groups';
  end if;

  loop
    -- No 0/O or 1/I, so codes are easy to read out.
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    into new_code from generate_series(1, 6);
    begin
      insert into public.player_groups (name, code, owner) values (clean, new_code, uid) returning id into gid;
      exit;
    exception when unique_violation then
      -- Taken: try another code.
    end;
  end loop;

  insert into public.group_members (group_id, user_id) values (gid, uid);
  return jsonb_build_object('id', gid, 'name', clean, 'code', new_code, 'members', 1);
end;
$$;

-- Joins the group with this invite code. Returns its id and name.
create function public.join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  g public.player_groups;
begin
  select * into g from public.player_groups where code = upper(btrim(p_code));
  if not found then
    raise exception 'group_not_found';
  end if;
  if not exists (select 1 from public.group_members where group_id = g.id and user_id = uid) then
    if (select count(*) from public.group_members where user_id = uid) >= 10 then
      raise exception 'too_many_groups';
    end if;
    if (select count(*) from public.group_members where group_id = g.id) >= 100 then
      raise exception 'group_full';
    end if;
    insert into public.group_members (group_id, user_id) values (g.id, uid);
  end if;
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.code);
end;
$$;

-- Leaves a group. The last player to leave deletes it.
create function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  delete from public.group_members where group_id = p_group and user_id = uid;
  delete from public.player_groups g
  where g.id = p_group and not exists (select 1 from public.group_members m where m.group_id = g.id);
end;
$$;

-- The player's groups, with their codes and how many players each has.
create function public.my_groups()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'code', g.code,
           'members', (select count(*) from public.group_members c where c.group_id = g.id)
         ) order by m.joined_at), '[]'::jsonb)
  from public.group_members m
  join public.player_groups g on g.id = m.group_id
  where m.user_id = (select auth.uid());
$$;

-- Permissions ---------------------------------------------------------------

revoke all on schema private from public;
revoke execute on all functions in schema private from public;

revoke execute on function public.start_ranked_game(text) from public, anon;
revoke execute on function public.ranked_next(uuid) from public, anon;
revoke execute on function public.ranked_answer(uuid, text) from public, anon;
revoke execute on function public.my_league() from public, anon;
revoke execute on function public.ranking(text, text, uuid) from public, anon;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.my_groups() from public, anon;

grant execute on function public.start_ranked_game(text) to authenticated;
grant execute on function public.ranked_next(uuid) to authenticated;
grant execute on function public.ranked_answer(uuid, text) to authenticated;
grant execute on function public.my_league() to authenticated;
grant execute on function public.ranking(text, text, uuid) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.my_groups() to authenticated;
