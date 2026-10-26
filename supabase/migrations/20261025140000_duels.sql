-- Step 3: asynchronous duels, as in Vocablo.
--
-- Two players get the same 10 questions (the same places and the same
-- options) and each plays whenever they can within 48 hours. Every duel game
-- is a server-run game like Ranked (same functions: ranked_next,
-- ranked_answer), so nobody can send a made-up score. The winner has the most
-- right answers; ties go to more points, then to less total time. The
-- winner's points go to their weekly league and the all-time ranking.
--
-- Ways to start one: challenge a player by name, share a link (or its code)
-- that anyone can open, or ask for a random rival.

-- Settings ------------------------------------------------------------------

-- The level of each of the 10 questions, the same for both players.
create function private.duel_rules()
returns table (hours int, max_active int, levels int[])
language sql
immutable
set search_path = ''
as $$
  select 48, 20, array[1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
$$;

-- Tables --------------------------------------------------------------------

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('friend', 'link', 'random')),
  challenger uuid not null references auth.users (id) on delete cascade,
  opponent uuid references auth.users (id) on delete cascade,
  -- Link duels: the code in the link, until someone takes it.
  code text unique check (code ~ '^[A-Z0-9]{6}$'),
  -- waiting: no rival yet; active: both players known; done: decided
  -- (winner null = a draw); expired: nobody played in time; declined.
  status text not null default 'active' check (status in ('waiting', 'active', 'done', 'expired', 'declined')),
  winner uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  check (challenger is distinct from opponent)
);
create index duels_challenger on public.duels (challenger, created_at desc);
create index duels_opponent on public.duels (opponent, created_at desc);
create index duels_open_random on public.duels (created_at) where kind = 'random' and status = 'waiting';

-- The questions of a duel, picked when it is created.
create table public.duel_questions (
  duel_id uuid not null references public.duels (id) on delete cascade,
  round smallint not null,
  mode text not null,
  iso text not null,
  options text[] not null,
  tier smallint not null,
  primary key (duel_id, round)
);

-- Each player's game in a duel is a ranked game with these questions.
alter table public.ranked_games add column duel_id uuid references public.duels (id) on delete cascade;
create unique index ranked_games_duel_player on public.ranked_games (duel_id, user_id) where duel_id is not null;

alter table public.duels enable row level security;
alter table public.duel_questions enable row level security;

-- Helpers (not callable from the app) ---------------------------------------

create function private.require_data(p_data text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_data is distinct from (select data from public.ranked_config) then
    raise exception 'data_mismatch';
  end if;
end;
$$;

-- Duels the player has started or been challenged to and not finished.
create function private.active_duels(p_user uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.duels
  where (challenger = p_user or opponent = p_user) and status in ('waiting', 'active') and expires_at > now();
$$;

-- A new duel with its 10 questions.
create function private.new_duel(p_user uuid, p_kind text, p_opponent uuid, p_code text, p_status text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  r record;
  did uuid;
  lvl int;
  i int := 0;
  q record;
  m text;
begin
  select * into r from private.duel_rules();
  if private.active_duels(p_user) >= r.max_active then
    raise exception 'too_many_duels';
  end if;

  insert into public.duels (kind, challenger, opponent, code, status, expires_at)
  values (p_kind, p_user, p_opponent, p_code, p_status, now() + make_interval(hours => r.hours))
  returning id into did;

  foreach lvl in array r.levels loop
    m := private.ranked_mode(i);
    select * into q from private.pick_question(
      m, lvl, coalesce((select array_agg(x.iso) from public.duel_questions x where x.duel_id = did), '{}')
    );
    insert into public.duel_questions (duel_id, round, mode, iso, options, tier)
    values (did, i, m, q.iso, q.options, q.tier);
    i := i + 1;
  end loop;
  return did;
end;
$$;

-- A player's result in a duel: right answers, points and total time.
create function private.duel_score(p_duel uuid, p_user uuid)
returns table (game_id uuid, finished boolean, correct int, score int, ms int)
language sql
stable
set search_path = ''
as $$
  select g.id, g.finished_at is not null, g.correct::int, g.score,
         coalesce((
           select sum(least(
                    floor(extract(epoch from coalesce(i.answered_at, i.deadline) - i.shown_at) * 1000),
                    (select seconds from private.ranked_rules()) * 1000
                  ))::int
           from public.ranked_items i where i.game_id = g.id
         ), 0)
  from public.ranked_games g
  where g.duel_id = p_duel and g.user_id = p_user;
$$;

-- Settles a duel when both players have finished, or when its time is up.
-- The winner's points go to their league and the all-time ranking.
create function private.settle_duel(p_duel uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  d public.duels;
  a record;
  b record;
  win uuid;
  pts int;
  w date := private.current_week();
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status not in ('waiting', 'active') then
    return;
  end if;

  if now() > d.expires_at then
    -- Time's up: any half-played game ends where it is.
    update public.ranked_games set finished_at = now() where duel_id = d.id and finished_at is null;
  end if;

  select * into a from private.duel_score(d.id, d.challenger);
  select * into b from private.duel_score(d.id, d.opponent);

  if coalesce(a.finished, false) and coalesce(b.finished, false) then
    win := case
      when a.correct <> b.correct then case when a.correct > b.correct then d.challenger else d.opponent end
      when a.score <> b.score then case when a.score > b.score then d.challenger else d.opponent end
      when a.ms <> b.ms then case when a.ms < b.ms then d.challenger else d.opponent end
    end;
  elsif now() > d.expires_at then
    -- Only one played: they win, if a rival took the duel at all. Otherwise
    -- the duel just expires.
    if d.opponent is null then
      update public.duels set status = 'expired', finished_at = now() where id = d.id;
      return;
    elsif coalesce(a.finished, false) then
      win := d.challenger;
    elsif coalesce(b.finished, false) then
      win := d.opponent;
    else
      update public.duels set status = 'expired', finished_at = now() where id = d.id;
      return;
    end if;
  else
    return; -- still waiting for a player
  end if;

  update public.duels set status = 'done', winner = win, finished_at = now() where id = d.id;

  if win is not null then
    pts := case when win = d.challenger then a.score else b.score end;
    if pts > 0 then
      perform private.join_league(win, w);
      update public.league_members set points = points + pts, reached_at = now() where week = w and user_id = win;
      insert into public.player_totals (user_id, points) values (win, pts)
      on conflict (user_id) do update set points = public.player_totals.points + pts, updated_at = now();
    end if;
  end if;
end;
$$;

-- Settles every duel of the player whose time is up.
create function private.settle_expired(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  did uuid;
begin
  for did in
    select id from public.duels
    where (challenger = p_user or opponent = p_user) and status in ('waiting', 'active') and expires_at <= now()
  loop
    perform private.settle_duel(did);
  end loop;
end;
$$;

-- The game functions from step 2 now also serve duels -----------------------

-- Same as before, plus: a duel game gives no league points per question (the
-- winner gets them at the end), and settles the duel when it finishes.
create or replace function private.settle_question(p_game public.ranked_games, p_iso text)
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

  if p_game.duel_id is not null then
    if done then
      perform private.settle_duel(p_game.duel_id);
    end if;
  elsif pts > 0 then
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

-- Same as before, but starting a ranked game leaves duel games alone.
create or replace function public.start_ranked_game(p_data text)
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
  perform private.require_data(p_data);
  select * into r from private.ranked_rules();

  -- A new game ends any ranked game left half played.
  update public.ranked_games set finished_at = now()
  where user_id = uid and finished_at is null and duel_id is null;

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

-- Same as before, but a duel game takes the duel's question for the round,
-- and a duel whose time is up can't be played on.
create or replace function public.ranked_next(p_game uuid)
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

  if g.duel_id is not null and g.finished_at is null
     and exists (select 1 from public.duels where id = g.duel_id and expires_at <= now()) then
    perform private.settle_duel(g.duel_id);
    select * into g from public.ranked_games where id = p_game;
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

  if g.duel_id is not null then
    select x.mode, x.iso, x.options, x.tier into q from public.duel_questions x
    where x.duel_id = g.duel_id and x.round = g.round;
    m := q.mode;
  else
    m := private.ranked_mode(g.round);
    select * into q from private.pick_question(
      m, g.level, coalesce((select array_agg(i.iso) from public.ranked_items i where i.game_id = g.id), '{}')
    );
  end if;

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

-- Duel functions --------------------------------------------------------------

-- Challenges a player by name, or, with no name, makes a link duel whose
-- code anyone can open. Returns its id and code.
create function public.create_duel(p_data text, p_nickname text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  rival uuid;
  new_code text;
  did uuid;
begin
  perform private.require_data(p_data);

  if nullif(btrim(p_nickname), '') is not null then
    select id into rival from public.profiles where lower(nickname) = lower(btrim(p_nickname));
    if not found then
      raise exception 'player_not_found';
    end if;
    if rival = uid then
      raise exception 'own_duel';
    end if;
    did := private.new_duel(uid, 'friend', rival, null, 'active');
    return jsonb_build_object('id', did, 'code', null);
  end if;

  loop
    -- No 0/O or 1/I, so codes are easy to read out.
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    into new_code from generate_series(1, 6);
    exit when not exists (select 1 from public.duels where code = new_code);
  end loop;
  did := private.new_duel(uid, 'link', null, new_code, 'waiting');
  return jsonb_build_object('id', did, 'code', new_code);
end;
$$;

-- Takes the link duel with this code.
create function public.join_duel(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  d public.duels;
begin
  select * into d from public.duels where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'duel_not_found';
  end if;
  if d.challenger = uid then
    raise exception 'own_duel';
  end if;
  if d.opponent = uid then
    return jsonb_build_object('id', d.id); -- already joined
  end if;
  if d.opponent is not null then
    raise exception 'duel_taken';
  end if;
  if d.status <> 'waiting' or d.expires_at <= now() then
    raise exception 'duel_expired';
  end if;
  if private.active_duels(uid) >= (select max_active from private.duel_rules()) then
    raise exception 'too_many_duels';
  end if;
  update public.duels set opponent = uid, status = 'active' where id = d.id;
  return jsonb_build_object('id', d.id);
end;
$$;

-- A random rival: joins the oldest random duel someone else is waiting on,
-- preferring players of a close league tier; if there's none, starts one
-- that waits for the next player who asks.
create function public.random_duel(p_data text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
  my_tier int;
  did uuid;
begin
  perform private.require_data(p_data);
  if private.active_duels(uid) >= (select max_active from private.duel_rules()) then
    raise exception 'too_many_duels';
  end if;
  select coalesce((select tier from public.player_league where user_id = uid), 0) into my_tier;

  select d.id into did from public.duels d
  left join public.player_league pl on pl.user_id = d.challenger
  where d.kind = 'random' and d.status = 'waiting' and d.expires_at > now()
    and d.challenger <> uid
    -- Not someone this player already has a duel going with.
    and not exists (
      select 1 from public.duels o
      where o.status in ('waiting', 'active')
        and ((o.challenger = uid and o.opponent = d.challenger) or (o.opponent = uid and o.challenger = d.challenger))
    )
  order by abs(coalesce(pl.tier, 0) - my_tier) > 1, d.created_at
  limit 1
  for update of d skip locked;

  if did is not null then
    update public.duels set opponent = uid, status = 'active' where id = did;
    return jsonb_build_object('id', did, 'matched', true);
  end if;

  -- Only one random duel waiting per player.
  select id into did from public.duels
  where challenger = uid and kind = 'random' and status = 'waiting' and expires_at > now()
  limit 1;
  if did is null then
    did := private.new_duel(uid, 'random', null, null, 'waiting');
  end if;
  return jsonb_build_object('id', did, 'matched', false);
end;
$$;

-- Turns down a duel before playing it.
create function public.decline_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  update public.duels d set status = 'declined', finished_at = now()
  where d.id = p_duel and d.opponent = uid and d.status = 'active'
    and not exists (select 1 from public.ranked_games g where g.duel_id = d.id and g.user_id = uid);
end;
$$;

-- Cancels a duel nobody has taken yet (a link or random duel), as long as
-- the challenger hasn't played it.
create function public.cancel_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  delete from public.duels d
  where d.id = p_duel and d.challenger = uid and d.status = 'waiting'
    and not exists (select 1 from public.ranked_games g where g.duel_id = d.id);
end;
$$;

-- Starts (or goes back to) the player's game in a duel. Returns the same as
-- start_ranked_game.
create function public.play_duel(p_data text, p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  r record;
  d public.duels;
  g public.ranked_games;
begin
  perform private.require_data(p_data);
  select * into r from private.ranked_rules();
  select * into d from public.duels where id = p_duel and (challenger = uid or opponent = uid);
  if not found then
    raise exception 'duel_not_found';
  end if;
  if d.status not in ('waiting', 'active') or d.expires_at <= now() then
    perform private.settle_duel(d.id);
    raise exception 'duel_over';
  end if;

  select * into g from public.ranked_games where duel_id = d.id and user_id = uid;
  if found and g.finished_at is not null then
    raise exception 'already_played';
  end if;
  if not found then
    insert into public.ranked_games (user_id, week, level, duel_id)
    values (uid, private.current_week(), r.start_level, d.id)
    returning * into g;
  end if;

  return jsonb_build_object('id', g.id, 'rounds', r.rounds, 'seconds', r.seconds);
end;
$$;

-- The player's duels: open ones first, then the last 20 finished.
create function public.my_duels()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  result jsonb;
begin
  perform private.settle_expired(uid);

  with mine as (
    (select * from public.duels
     where (challenger = uid or opponent = uid) and status in ('waiting', 'active'))
    union all
    (select * from public.duels
     where (challenger = uid or opponent = uid) and status not in ('waiting', 'active')
     order by finished_at desc nulls last
     limit 20)
  ),
  rows as (
    select d.*,
           case when d.challenger = uid then d.opponent else d.challenger end as rival,
           me.finished as me_done, me.game_id as me_game, me.correct as me_correct, me.score as me_score, me.ms as me_ms,
           them.finished as them_done, them.game_id as them_game,
           them.correct as them_correct, them.score as them_score, them.ms as them_ms
    from mine d
    left join lateral private.duel_score(d.id, uid) me on true
    left join lateral private.duel_score(d.id, case when d.challenger = uid then d.opponent else d.challenger end) them on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'kind', x.kind,
           'status', x.status,
           'code', case when x.challenger = uid then x.code end,
           'mine', x.challenger = uid,
           'rival', p.nickname,
           'rival_country', p.country,
           'expires_at', x.expires_at,
           'finished_at', x.finished_at,
           'to_play', x.status in ('waiting', 'active') and not coalesce(x.me_done, false),
           'me', jsonb_build_object(
             'played', coalesce(x.me_done, false), 'started', x.me_game is not null,
             'correct', x.me_correct, 'score', x.me_score, 'ms', x.me_ms),
           -- The rival's result only shows once the player has played too.
           'them', jsonb_build_object(
             'played', coalesce(x.them_done, false),
             'correct', case when coalesce(x.me_done, false) then x.them_correct end,
             'score', case when coalesce(x.me_done, false) then x.them_score end,
             'ms', case when coalesce(x.me_done, false) then x.them_ms end),
           'result', case
             when x.status <> 'done' then null
             when x.winner is null then 'draw'
             when x.winner = uid then 'won'
             else 'lost'
           end
         ) order by x.status not in ('waiting', 'active'), coalesce(x.finished_at, x.created_at) desc), '[]'::jsonb)
  into result
  from rows x
  left join public.profiles p on p.id = x.rival;
  return result;
end;
$$;

-- A duel question by question. Nothing before the player has played (the
-- questions are a surprise); the rival's answers only once it's over.
create function public.duel_detail(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  d public.duels;
  rival uuid;
  me_game uuid;
  them_game uuid;
  me_done boolean;
  over boolean;
begin
  select * into d from public.duels where id = p_duel and (challenger = uid or opponent = uid);
  if not found then
    raise exception 'duel_not_found';
  end if;
  rival := case when d.challenger = uid then d.opponent else d.challenger end;
  select id, finished_at is not null into me_game, me_done from public.ranked_games where duel_id = d.id and user_id = uid;
  select id into them_game from public.ranked_games where duel_id = d.id and user_id = rival;
  over := d.status in ('done', 'expired');

  if not coalesce(me_done, false) and not over then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'round', x.round,
             'mode', x.mode,
             'iso', x.iso,
             'me', case when mi.game_id is not null then jsonb_build_object('correct', mi.correct, 'points', mi.points) end,
             'them', case when over and ti.game_id is not null then jsonb_build_object('correct', ti.correct, 'points', ti.points) end
           ) order by x.round)
    from public.duel_questions x
    left join public.ranked_items mi on mi.game_id = me_game and mi.round = x.round
    left join public.ranked_items ti on ti.game_id = them_game and ti.round = x.round
    where x.duel_id = d.id
  ), '[]'::jsonb);
end;
$$;

-- Permissions ---------------------------------------------------------------

revoke execute on all functions in schema private from public;

revoke execute on function public.create_duel(text, text) from public, anon;
revoke execute on function public.join_duel(text) from public, anon;
revoke execute on function public.random_duel(text) from public, anon;
revoke execute on function public.decline_duel(uuid) from public, anon;
revoke execute on function public.cancel_duel(uuid) from public, anon;
revoke execute on function public.play_duel(text, uuid) from public, anon;
revoke execute on function public.my_duels() from public, anon;
revoke execute on function public.duel_detail(uuid) from public, anon;

grant execute on function public.create_duel(text, text) to authenticated;
grant execute on function public.join_duel(text) to authenticated;
grant execute on function public.random_duel(text) to authenticated;
grant execute on function public.decline_duel(uuid) to authenticated;
grant execute on function public.cancel_duel(uuid) to authenticated;
grant execute on function public.play_duel(text, uuid) to authenticated;
grant execute on function public.my_duels() to authenticated;
grant execute on function public.duel_detail(uuid) to authenticated;
