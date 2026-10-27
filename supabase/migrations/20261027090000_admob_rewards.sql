-- Real rewarded ads (AdMob), as in Vocablo.
--
-- With real ads the phone no longer says "I watched an ad". When an ad ends,
-- Google calls the admob-reward Edge Function (supabase/functions), which
-- checks Google's signature and calls public.admob_reward() with the service
-- role. Google's transaction id goes in wallet_ledger.store_transaction, so a
-- repeated call never gives a second hint. The phone attaches a random nonce
-- to each ad and asks ad_reward_status() until that ad's hint is there.
--
-- public.reward_ad() (the app reporting the ad itself) now only works for
-- No ads (the hint without an ad) or while
-- private.shop_config.test_purchases is on: Google's sample ads, used until
-- Atlas Go has its own ad units, never call our server.

alter table public.wallet_ledger add column ad_nonce text;
create index wallet_ledger_ad_nonce on public.wallet_ledger (user_id, ad_nonce) where ad_nonce is not null;

-- One hint for a watched ad, at most ads_per_day a day, once per transaction.
-- Returns the status ('granted', 'duplicate', 'limit', 'unknown_user') and the wallet.
create function private.give_ad_hint(p_user uuid, p_transaction text, p_nonce text)
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
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('status', 'unknown_user');
  end if;
  select * into r from private.shop_rules();
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_user for update;
  if exists (select 1 from public.wallet_ledger where store_transaction = p_transaction) then
    return jsonb_build_object('status', 'duplicate', 'wallet', private.wallet_json(w));
  end if;
  today := case when w.ad_day = current_date then w.ads_today else 0 end;
  if today >= r.ads_per_day then
    return jsonb_build_object('status', 'limit', 'wallet', private.wallet_json(w));
  end if;
  update public.wallets
  set hints = hints + r.ad_hints, ad_day = current_date, ads_today = today + 1, updated_at = now()
  where user_id = p_user
  returning * into w;
  insert into public.wallet_ledger (user_id, hints, reason, store_transaction, ad_nonce)
  values (p_user, r.ad_hints, 'ad', p_transaction, p_nonce);
  return jsonb_build_object('status', 'granted', 'wallet', private.wallet_json(w));
end;
$$;

-- Called by the admob-reward Edge Function after it has checked Google's signature.
create function public.admob_reward(p_user uuid, p_transaction text, p_nonce text)
returns text
language sql
security definer
set search_path = ''
as $$
  select private.give_ad_hint(p_user, 'admob-' || p_transaction, nullif(p_nonce, '')) ->> 'status';
$$;

-- Whether the ad with this nonce has given its hint yet, with the wallet.
create function public.ad_reward_status(p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wallets;
begin
  w := private.my_wallet_row();
  return private.wallet_json(w) || jsonb_build_object(
    'found', exists (select 1 from public.wallet_ledger where user_id = w.user_id and ad_nonce = p_nonce)
  );
end;
$$;

-- The daily ad hints without an ad (No ads), or the app reporting a
-- watched ad in the test shop.
create or replace function public.reward_ad()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not (select test_purchases from private.shop_config)
     and not coalesce((select ad_free from public.wallets where user_id = auth.uid()), false) then
    raise exception 'shop_closed';
  end if;
  result := private.give_ad_hint(auth.uid(), 'test-ad-' || gen_random_uuid(), null);
  if result ->> 'status' = 'limit' then
    raise exception 'ad_limit';
  end if;
  return result -> 'wallet';
end;
$$;

revoke execute on function private.give_ad_hint(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admob_reward(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ad_reward_status(text) from public, anon;
grant execute on function public.admob_reward(uuid, text, text) to service_role;
grant execute on function public.ad_reward_status(text) to authenticated;
