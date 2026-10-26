-- The shop, as in Vocablo (enriqueazo/e-e), with the geography game's boosts.
--
-- Each player has a wallet of hints and discards on the server, so it can't
-- be edited on the phone and survives a new phone. Solo games use it; Ranked,
-- duels and the map of the day never touch it.
--   - A hint shows where to look: the map behind a flag or a silhouette, the
--     capital of a country, the country of a capital, or where the place is in
--     Complete the map.
--   - A discard takes away one wrong option, or one wrong name in Neighbours.
-- The wallet fills up with:
--   - a daily gift (one discard a day),
--   - rewarded ads (one hint per ad, a few a day),
--   - purchases. Until the store accounts exist only test purchases work, and
--     only while private.shop_config.test_purchases is on.
-- Every change is written to wallet_ledger.

-- Settings ------------------------------------------------------------------

create table private.shop_config (
  only_row boolean primary key default true check (only_row),
  -- Lets the app "buy" without a store. Turn it off before the real launch:
  --   update private.shop_config set test_purchases = false;
  test_purchases boolean not null default true
);
insert into private.shop_config default values;

create function private.shop_rules()
returns table (gift_discards int, ad_hints int, ads_per_day int)
language sql
immutable
set search_path = ''
as $$
  select 1, 1, 5;
$$;

-- What each product gives. The prices live in the stores.
create function private.product(p_id text)
returns table (hints int, discards int, ad_free boolean)
language sql
immutable
set search_path = ''
as $$
  select p.hints, p.discards, p.ad_free
  from (values
    ('hints_10', 10, 0, false),
    ('hints_50', 50, 0, false),
    ('discards_10', 0, 10, false),
    ('discards_50', 0, 50, false),
    ('no_ads', 0, 0, true)
  ) as p (id, hints, discards, ad_free)
  where p.id = p_id;
$$;

-- Tables --------------------------------------------------------------------

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hints int not null default 0 check (hints >= 0),
  discards int not null default 0 check (discards >= 0),
  ad_free boolean not null default false,
  -- The player's local day of the last daily gift.
  gift_day date,
  -- Rewarded ads watched on ad_day (UTC).
  ad_day date,
  ads_today int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  hints int not null default 0,
  discards int not null default 0,
  reason text not null check (reason in ('gift', 'ad', 'purchase', 'used')),
  product text,
  -- The store's transaction id, so a purchase is never granted twice.
  store_transaction text unique,
  created_at timestamptz not null default now()
);
create index wallet_ledger_user on public.wallet_ledger (user_id, created_at desc);

-- Only the functions below read or write these.
alter table private.shop_config enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;

-- Helpers -------------------------------------------------------------------

-- The caller's wallet, created empty on first use and locked for the change.
create function private.my_wallet_row()
returns public.wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = auth.uid() for update;
  return w;
end;
$$;

create function private.wallet_json(w public.wallets)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from private.shop_rules();
  return jsonb_build_object(
    'hints', w.hints,
    'discards', w.discards,
    'ad_free', w.ad_free,
    'gift_day', w.gift_day,
    'ads_left', r.ads_per_day - case when w.ad_day = current_date then w.ads_today else 0 end,
    'test_purchases', (select test_purchases from private.shop_config)
  );
end;
$$;

-- Adds a purchase to a wallet, once per store transaction. Test purchases
-- use it now; the store's webhook will use it once the stores are set up.
create function private.grant_purchase(p_user uuid, p_product text, p_transaction text)
returns public.wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  w public.wallets;
begin
  select * into p from private.product(p_product);
  if not found then
    raise exception 'unknown_product';
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  insert into public.wallet_ledger (user_id, hints, discards, reason, product, store_transaction)
  values (p_user, p.hints, p.discards, 'purchase', p_product, p_transaction)
  on conflict (store_transaction) do nothing;
  if found then
    update public.wallets
    set hints = hints + p.hints, discards = discards + p.discards,
        ad_free = ad_free or p.ad_free, updated_at = now()
    where user_id = p_user;
  end if;
  select * into w from public.wallets where user_id = p_user;
  return w;
end;
$$;

-- Public functions ----------------------------------------------------------

create function public.my_wallet()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.wallet_json(private.my_wallet_row());
$$;

-- Hints and discards used in solo games, sent in a batch (they can be used
-- offline). Never goes below zero.
create function public.spend_boosts(p_hints int, p_discards int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets;
  h int;
  d int;
begin
  w := private.my_wallet_row();
  h := least(greatest(coalesce(p_hints, 0), 0), w.hints);
  d := least(greatest(coalesce(p_discards, 0), 0), w.discards);
  if h > 0 or d > 0 then
    update public.wallets
    set hints = hints - h, discards = discards - d, updated_at = now()
    where user_id = w.user_id
    returning * into w;
    insert into public.wallet_ledger (user_id, hints, discards, reason)
    values (w.user_id, -h, -d, 'used');
  end if;
  return private.wallet_json(w);
end;
$$;

-- The daily gift, once per day of the player's calendar. The phone sends its
-- local date, which may be at most a day away from the server's.
create function public.claim_daily_gift(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets;
  gift int := (select gift_discards from private.shop_rules());
  granted boolean := false;
begin
  if p_day is null or p_day not between current_date - 1 and current_date + 1 then
    raise exception 'bad_day';
  end if;
  w := private.my_wallet_row();
  if w.gift_day is null or p_day > w.gift_day then
    update public.wallets
    set discards = discards + gift, gift_day = p_day, updated_at = now()
    where user_id = w.user_id
    returning * into w;
    insert into public.wallet_ledger (user_id, discards, reason) values (w.user_id, gift, 'gift');
    granted := true;
  end if;
  return private.wallet_json(w) || jsonb_build_object('granted', granted);
end;
$$;

-- A rewarded ad was watched: one hint, a few times a day. In test mode the
-- app reports it; with real ads Google will confirm each ad to the
-- server instead.
create function public.reward_ad()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets;
  r record;
  today int;
begin
  select * into r from private.shop_rules();
  w := private.my_wallet_row();
  today := case when w.ad_day = current_date then w.ads_today else 0 end;
  if today >= r.ads_per_day then
    raise exception 'ad_limit';
  end if;
  update public.wallets
  set hints = hints + r.ad_hints, ad_day = current_date, ads_today = today + 1, updated_at = now()
  where user_id = w.user_id
  returning * into w;
  insert into public.wallet_ledger (user_id, hints, reason) values (w.user_id, r.ad_hints, 'ad');
  return private.wallet_json(w);
end;
$$;

-- A purchase with no store and no payment, while the shop is in test mode.
create function public.test_purchase(p_product text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not (select test_purchases from private.shop_config) then
    raise exception 'shop_closed';
  end if;
  return private.wallet_json(private.grant_purchase(auth.uid(), p_product, 'test-' || gen_random_uuid()));
end;
$$;

revoke execute on function private.my_wallet_row() from public, anon, authenticated;
revoke execute on function private.wallet_json(public.wallets) from public, anon, authenticated;
revoke execute on function private.grant_purchase(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.my_wallet() from public, anon;
revoke execute on function public.spend_boosts(int, int) from public, anon;
revoke execute on function public.claim_daily_gift(date) from public, anon;
revoke execute on function public.reward_ad() from public, anon;
revoke execute on function public.test_purchase(text) from public, anon;
grant execute on function public.my_wallet() to authenticated;
grant execute on function public.spend_boosts(int, int) to authenticated;
grant execute on function public.claim_daily_gift(date) to authenticated;
grant execute on function public.reward_ad() to authenticated;
grant execute on function public.test_purchase(text) to authenticated;
