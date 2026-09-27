-- ============================================================
-- eBay外注管理ツール 集荷・持ち込み報酬の1円端数の修正
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
--
-- 【原因】
-- 選択肢の値に金額そのものを使っていたため、金額が同じ
-- 「西濃集荷（200円）」と「DHL集荷（200円）」を区別できず、
-- DHL集荷だけ 201 という実在しない金額を保存していた。
-- その 201 がそのまま月次集計に足され、集荷・持ち込みが 1,501円 になっていた。
--
-- 【対応】
-- 1. 集荷方法を保存する列を追加し、金額は方法から引く（金額で方法を区別しない）
-- 2. 金額は 0 / 200 / 300 / 500 しか保存できないよう制約を付ける
-- 3. 既存データの 201 などを正しい金額へ修正する
-- 4. 発送後に集荷方法を変えても確定済み報酬に反映されるようにする
-- ============================================================

-- ─── 1. 集荷・持ち込み報酬の種別を保存する列を追加 ─────────────────
-- （Phase 7 の handover_method（集荷/持ち込み）とは別物なので名前を分けている）
alter table public.products
  add column if not exists handover_reward_method text not null default '';

alter table public.products
  drop constraint if exists products_handover_reward_method_check;
alter table public.products
  add constraint products_handover_reward_method_check
  check (handover_reward_method in ('', 'seino', 'dhl', 'post', 'post_heavy'));

-- ─── 2. 報酬種別 → 金額（金額の唯一の決定元） ───────────────────
create or replace function public.handover_reward_amount(p_method text)
returns integer
language sql immutable
as $$
  select case p_method
           when 'seino'      then 200
           when 'dhl'        then 200
           when 'post'       then 300
           when 'post_heavy' then 500
           else 0
         end;
$$;

-- 旧データ（金額だけが入っている行）を許可された金額へ丸める
-- ※この正規化は「集荷・持ち込み報酬」専用。他の報酬項目には使わない。
create or replace function public.normalize_handover_reward(p_value integer)
returns integer
language sql immutable
as $$
  select case
           when coalesce(p_value, 0) >= 500 then 500
           when coalesce(p_value, 0) >= 300 then 300
           when coalesce(p_value, 0) >= 200 then 200
           else 0
         end;
$$;

-- ─── 3. 既存データの修正 ───────────────────────────────────────
-- 既存の products_enforce_staff_update トリガーは
-- 「管理者以外による handover_reward の変更」を禁止している。
-- SQL Editor では auth.uid() が NULL のため is_admin() が false になり、
-- そのままでは下の修正UPDATEが弾かれてしまう。
-- そのため、この修正の間だけ当該トリガーを外し、終わったら必ず元に戻す。
-- 全体を1つのトランザクションにしているので、途中で失敗しても
-- トリガーが外れたままになることはない（すべて巻き戻る）。
begin;

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'products_enforce_staff_update'
      and tgrelid = 'public.products'::regclass
  ) then
    alter table public.products disable trigger products_enforce_staff_update;
  end if;
end $$;

-- 3-1. 保存済みの金額から報酬種別を復元する（201 は旧仕様のDHL集荷）
update public.products
set handover_reward_method = case
      when handover_reward = 201 then 'dhl'
      when handover_reward >= 500 then 'post_heavy'
      when handover_reward >= 300 then 'post'
      when handover_reward >= 200 then 'seino'
      else ''
    end
where handover_reward_method = '' and coalesce(handover_reward, 0) <> 0;

-- 3-2. 商品側の金額を報酬種別から計算し直す（201 → 200 など）
update public.products
set handover_reward = public.handover_reward_amount(handover_reward_method)
where handover_reward is distinct from public.handover_reward_amount(handover_reward_method);

-- 3-3. 確定済み報酬のうち、手修正されていない行（内訳の合計と支払額が一致する行）は
--      支払額も一緒に直す。手修正済みの行の金額は変更しない。
update public.work_rewards
set reward_amount = packing_reward + photo_reward + operation_check_reward
                  + public.normalize_handover_reward(handover_reward) + reimbursement
where handover_reward is distinct from public.normalize_handover_reward(handover_reward)
  and reward_amount = packing_reward + photo_reward + operation_check_reward
                    + handover_reward + reimbursement;

-- 3-4. 確定済み報酬の内訳を正しい金額へ（1,501円 → 1,500円 になるのはここ）
update public.work_rewards
set handover_reward = public.normalize_handover_reward(handover_reward)
where handover_reward is distinct from public.normalize_handover_reward(handover_reward);

-- 3-5. 外したトリガーを必ず元に戻す
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'products_enforce_staff_update'
      and tgrelid = 'public.products'::regclass
  ) then
    alter table public.products enable trigger products_enforce_staff_update;
  end if;
end $$;

commit;

-- ─── 4. 今後 1円単位の端数が保存されないようにする ────────────────
alter table public.products
  drop constraint if exists products_handover_reward_check;
alter table public.products
  add constraint products_handover_reward_check
  check (handover_reward in (0, 200, 300, 500));

alter table public.work_rewards
  drop constraint if exists work_rewards_handover_reward_check;
alter table public.work_rewards
  add constraint work_rewards_handover_reward_check
  check (handover_reward in (0, 200, 300, 500));

-- 報酬種別が変われば金額も必ず種別どおりに上書きする（差額計算はしない）
create or replace function public.sync_handover_reward()
returns trigger
language plpgsql
as $$
begin
  -- INSERT では old を参照できないので先に分岐する
  if tg_op = 'INSERT' then
    if new.handover_reward_method <> '' then
      new.handover_reward := public.handover_reward_amount(new.handover_reward_method);
    end if;
  elsif new.handover_reward_method is distinct from old.handover_reward_method then
    new.handover_reward := public.handover_reward_amount(new.handover_reward_method);
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_handover_reward on public.products;
create trigger products_sync_handover_reward
  before insert or update on public.products
  for each row execute function public.sync_handover_reward();

-- ─── 5. 発送後の変更を確定済み報酬にも反映（集計のズレ防止） ────────
-- これまでは発送完了時点の金額を work_rewards に控えるだけだったため、
-- そのあとで集荷方法などを変えると
-- 「今月の報酬合計（reward_amount）」と「支払明細（内訳の合計）」がずれていた。
create or replace function public.sync_reward_from_product()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_packing integer;
  v_photo integer;
  v_operation integer;
begin
  if new.handover_reward is distinct from old.handover_reward
  or new.photo_required is distinct from old.photo_required
  or new.operation_check_required is distinct from old.operation_check_required
  then
    select coalesce(f.amount, c.default_fee, 0) into v_packing
    from (select 1) dummy
    left join public.product_fees f on f.product_id = new.id
    left join public.categories c on c.id = new.category_id;

    v_photo := case when new.photo_required then 100 else 0 end;
    v_operation := case when new.operation_check_required then 200 else 0 end;

    -- 内訳は常に実態へ合わせる。
    -- 支払額は「内訳の合計と一致している行（＝手修正されていない行）」だけ更新し、
    -- 管理者が明細画面で手修正した金額は保つ。
    update public.work_rewards
    set reward_amount = case
          when reward_amount = packing_reward + photo_reward + operation_check_reward
                             + handover_reward + reimbursement
          then coalesce(v_packing, 0) + v_photo + v_operation
             + new.handover_reward + reimbursement
          else reward_amount
        end,
        packing_reward = coalesce(v_packing, 0),
        photo_reward = v_photo,
        operation_check_reward = v_operation,
        handover_reward = new.handover_reward
    where product_id = new.id;

  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_reward_from_product on public.products;
create trigger products_sync_reward_from_product
  after update on public.products
  for each row execute function public.sync_reward_from_product();
