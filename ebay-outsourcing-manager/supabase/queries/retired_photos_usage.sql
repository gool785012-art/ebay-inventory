-- ============================================================
-- 新規アップロードを廃止した5カテゴリーの写真が、どれだけ容量を使っているか調べる
-- （外箱 / シリアル番号 / 梱包前 / 梱包途中 / 発送ラベル貼付後）
--
-- ※ select のみです。データの変更・削除は一切行いません。
--    Supabase の SQL Editor に貼り付けて「Run」してください。
-- ============================================================

-- 1. カテゴリー別の枚数と容量
select
  case pp.photo_category
    when 'outer_box'      then '外箱'
    when 'serial'         then 'シリアル番号'
    when 'before_packing' then '梱包前'
    when 'packing'        then '梱包途中'
    when 'label_attached' then '発送ラベル貼付後'
  end                                                         as カテゴリー,
  count(*)                                                    as 枚数,
  count(o.id)                                                 as ファイルが存在する枚数,
  round(coalesce(sum((o.metadata->>'size')::bigint), 0) / 1024.0 / 1024.0, 2) as 容量_MB
from public.product_photos pp
left join storage.objects o
  on o.bucket_id = 'product-photos' and o.name = pp.storage_path
where pp.photo_category in ('outer_box', 'serial', 'before_packing', 'packing', 'label_attached')
group by pp.photo_category
order by 容量_MB desc;

-- 2. 写真全体との比較（削除した場合に何％減るか）
with all_photos as (
  select
    pp.photo_category in ('outer_box', 'serial', 'before_packing', 'packing', 'label_attached') as retired,
    coalesce((o.metadata->>'size')::bigint, 0) as bytes
  from public.product_photos pp
  left join storage.objects o
    on o.bucket_id = 'product-photos' and o.name = pp.storage_path
)
select
  count(*) filter (where retired)                                        as 廃止カテゴリー_枚数,
  count(*)                                                               as 写真全体_枚数,
  round(sum(bytes) filter (where retired) / 1024.0 / 1024.0, 2)          as 廃止カテゴリー_MB,
  round(sum(bytes) / 1024.0 / 1024.0, 2)                                 as 写真全体_MB,
  round(100.0 * sum(bytes) filter (where retired) / nullif(sum(bytes), 0), 1) as 削減できる割合_パーセント
from all_photos;

-- 3. 写真用バケット全体の容量（DBに記録のないファイルも含む）
select
  count(*)                                                        as ファイル数,
  round(sum((metadata->>'size')::bigint) / 1024.0 / 1024.0, 2)   as 容量_MB
from storage.objects
where bucket_id = 'product-photos';
