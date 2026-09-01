-- ============================================================
-- eBay外注管理ツール 立替金管理SQL（Phase 10）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 立替金の明細登録・領収書・承認・月次集計が使えるようになります。
-- ============================================================

-- ─── 1. 立替金の明細テーブル ─────────────────────────────────
-- 1件の作業で「郵便送料」「ダンボール」「梱包テープ」など複数登録できる。
-- 作業報酬（work_rewards）とは完全に別テーブルにして、混ざらないようにする。
create table public.product_expenses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  expense_type text not null check (expense_type in (
    'postal_postage',   -- 郵便送料
    'packing_material', -- 梱包資材
    'other'             -- その他
  )),
  description text not null default '',
  amount integer not null check (amount >= 0),   -- マイナス金額は登録できない
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),  -- 未確認/承認済み/差し戻し
  no_receipt_approved boolean not null default false,        -- 領収書なしで管理者が承認
  admin_note text not null default '',
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_expenses_product_idx on public.product_expenses (product_id);
create index product_expenses_status_idx on public.product_expenses (status);

-- ─── 2. 領収書（立替金1件につき複数枚） ────────────────────────
create table public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.product_expenses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index expense_receipts_expense_idx on public.expense_receipts (expense_id);

-- ─── 3. 更新日時と更新者の自動記録 ──────────────────────────────
create or replace function public.expenses_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger product_expenses_before_update
  before update on public.product_expenses
  for each row execute function public.expenses_before_update();

-- ─── 4. 立替金の操作履歴（誰が・いつ・何を） ─────────────────────
create or replace function public.log_expense_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'expense_added', new.expense_type,
            '', new.amount::text || '円 ' || new.description);
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (old.product_id, auth.uid(), 'expense_deleted', old.expense_type,
            old.amount::text || '円 ' || old.description, '');
    return old;
  end if;
  if new.amount is distinct from old.amount then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'expense_amount_changed', new.expense_type,
            old.amount::text || '円', new.amount::text || '円');
  end if;
  if new.status is distinct from old.status then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'expense_status_changed', new.expense_type,
            old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger product_expenses_log
  after insert or update or delete on public.product_expenses
  for each row execute function public.log_expense_changes();

-- ─── 5. アクセス制御（RLS） ──────────────────────────────────
-- 管理者: すべて閲覧・編集・承認可能
-- スタッフ: 自分の担当商品の立替金のみ登録・閲覧・編集可能
--           （ただし承認ステータスは変更できない）
alter table public.product_expenses enable row level security;
alter table public.expense_receipts enable row level security;

create policy "expenses_admin_all" on public.product_expenses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "expenses_staff_select" on public.product_expenses
  for select using (public.is_assigned(product_id));

create policy "expenses_staff_insert" on public.product_expenses
  for insert with check (public.is_assigned(product_id) and status = 'pending');

create policy "expenses_staff_update" on public.product_expenses
  for update using (public.is_assigned(product_id) and status <> 'approved')
  with check (public.is_assigned(product_id));

create policy "expenses_staff_delete" on public.product_expenses
  for delete using (public.is_assigned(product_id) and status = 'pending');

-- スタッフが承認ステータスを勝手に変えられないようにする
create or replace function public.enforce_staff_expense_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
  or new.no_receipt_approved is distinct from old.no_receipt_approved
  or new.admin_note is distinct from old.admin_note
  then
    raise exception '承認に関する項目は管理者のみ変更できます';
  end if;
  return new;
end;
$$;

create trigger product_expenses_enforce_staff
  before update on public.product_expenses
  for each row execute function public.enforce_staff_expense_update();

create policy "receipts_admin_all" on public.expense_receipts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "receipts_staff_select" on public.expense_receipts
  for select using (public.is_assigned(product_id));

create policy "receipts_staff_insert" on public.expense_receipts
  for insert with check (public.is_assigned(product_id) and uploaded_by = auth.uid());

create policy "receipts_staff_delete" on public.expense_receipts
  for delete using (public.is_assigned(product_id));

-- ─── 6. 領収書の保存領域（非公開バケット） ──────────────────────
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

create policy "storage_receipts_admin_all" on storage.objects
  for all
  using (bucket_id = 'expense-receipts' and public.is_admin())
  with check (bucket_id = 'expense-receipts' and public.is_admin());

create policy "storage_receipts_staff_read" on storage.objects
  for select
  using (
    bucket_id = 'expense-receipts'
    and public.is_assigned(((storage.foldername(name))[1])::uuid)
  );

create policy "storage_receipts_staff_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'expense-receipts'
    and public.is_assigned(((storage.foldername(name))[1])::uuid)
  );

-- ─── 7. 報酬確定に立替金を含める（承認済みのみ） ─────────────────
-- 作業報酬と立替金は work_rewards の別カラムで管理し、混ざらないようにする。
-- 立替金は「承認済み」のものだけ支払い対象にする。
create or replace function public.confirm_reward()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_packing integer;
  v_photo integer;
  v_operation integer;
  v_expense integer;
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    select coalesce(f.amount, c.default_fee, 0) into v_packing
    from (select 1) dummy
    left join public.product_fees f on f.product_id = new.id
    left join public.categories c on c.id = new.category_id;

    v_photo := case when new.photo_required then 100 else 0 end;
    v_operation := case when new.operation_check_required then 200 else 0 end;

    -- 承認済みの立替金を合計（未承認は後から反映される）
    select coalesce(sum(amount), 0) into v_expense
    from public.product_expenses
    where product_id = new.id and status = 'approved';

    insert into public.work_rewards (
      staff_id, product_id, reward_amount, completed_at,
      packing_reward, photo_reward, operation_check_reward, handover_reward, reimbursement
    )
    values (
      new.assigned_staff_id,
      new.id,
      coalesce(v_packing, 0) + v_photo + v_operation + new.handover_reward + v_expense,
      coalesce(new.shipped_date, current_date),
      coalesce(v_packing, 0), v_photo, v_operation,
      new.handover_reward, v_expense
    )
    on conflict (product_id) do nothing;
  end if;
  return new;
end;
$$;

-- ─── 8. 立替金の承認時に確定済み報酬へ反映 ──────────────────────
-- 発送完了後に立替金が承認された場合も、支払額に自動で加算する。
create or replace function public.sync_reward_expense()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_product_id uuid;
  v_expense integer;
begin
  v_product_id := coalesce(new.product_id, old.product_id);

  select coalesce(sum(amount), 0) into v_expense
  from public.product_expenses
  where product_id = v_product_id and status = 'approved';

  update public.work_rewards
  set reimbursement = v_expense,
      reward_amount = packing_reward + photo_reward + operation_check_reward
                    + handover_reward + v_expense
  where product_id = v_product_id;

  return coalesce(new, old);
end;
$$;

create trigger product_expenses_sync_reward
  after insert or update or delete on public.product_expenses
  for each row execute function public.sync_reward_expense();
