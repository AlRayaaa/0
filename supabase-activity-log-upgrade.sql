-- ترقية سجل النشاط: يسجل الحقول التي تغيّرت في المنتجات والمبيعات والمشتريات.
alter table public.activity_log add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare n text; oldj jsonb; newj jsonb; changes jsonb := '{}'::jsonb; k text; ov jsonb; nv jsonb;
begin
  n := case when tg_op='DELETE' then old.name else new.name end;
  if tg_op='UPDATE' then
    oldj := to_jsonb(old); newj := to_jsonb(new);
    for k in select key from jsonb_each(oldj) loop
      if k in ('updated_at','updated_by') then continue; end if;
      ov := oldj->k; nv := newj->k;
      if ov is distinct from nv then changes := changes || jsonb_build_object(k,jsonb_build_object('from',ov,'to',nv)); end if;
    end loop;
  elsif tg_op='INSERT' then changes := jsonb_build_object('created',true);
  else changes := jsonb_build_object('deleted',true); end if;
  insert into public.activity_log(user_id,user_name,action,entity_type,entity_id,entity_name,details)
  values (auth.uid(), public.current_display_name(), tg_op, tg_table_name, coalesce((case when tg_op='DELETE' then old.id else new.id end)::text,''), n, jsonb_build_object('changes',changes));
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists products_activity on public.products;
create trigger products_activity after insert or update or delete on public.products for each row execute procedure public.log_activity();

create or replace function public.log_named_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare n text; oldj jsonb; newj jsonb; changes jsonb := '{}'::jsonb; k text; ov jsonb; nv jsonb;
begin
  n := case when tg_op='DELETE' then old.name else new.name end;
  if tg_op='UPDATE' then
    oldj := to_jsonb(old); newj := to_jsonb(new);
    for k in select key from jsonb_each(oldj) loop
      if k in ('created_at') then continue; end if;
      ov := oldj->k; nv := newj->k;
      if ov is distinct from nv then changes := changes || jsonb_build_object(k,jsonb_build_object('from',ov,'to',nv)); end if;
    end loop;
  elsif tg_op='INSERT' then changes := jsonb_build_object('created',true);
  else changes := jsonb_build_object('deleted',true); end if;
  insert into public.activity_log(user_id,user_name,action,entity_type,entity_id,entity_name,details)
  values (auth.uid(), public.current_display_name(), tg_op, tg_table_name, coalesce((case when tg_op='DELETE' then old.id else new.id end)::text,''), n, jsonb_build_object('changes',changes));
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists sales_activity on public.sales;
create trigger sales_activity after insert or update or delete on public.sales for each row execute procedure public.log_named_activity();
drop trigger if exists purchases_activity on public.purchases;
create trigger purchases_activity after insert or update or delete on public.purchases for each row execute procedure public.log_named_activity();

notify pgrst, 'reload schema';


-- ترقية عمليات البيع والشراء الذرّية.
create or replace function public.record_sale(
  p_product_id uuid,
  p_qty numeric,
  p_price numeric
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare p public.products%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY'; end if;
  if p_price is null or p_price <= 0 then raise exception 'INVALID_PRICE'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p.qty < p_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
  update public.products
    set qty=p.qty-p_qty, updated_by=auth.uid(), updated_at=now()
    where id=p_product_id;
  insert into public.sales(product_id,name,qty,total,buy,created_by)
    values(p.id,p.name,p_qty,p_qty*p_price,p.buy,auth.uid());
end;
$$;

grant execute on function public.record_sale(uuid,numeric,numeric) to authenticated;

create or replace function public.record_purchase(
  p_product_id uuid,
  p_qty numeric,
  p_price numeric,
  p_dealer text default '',
  p_invoice text default '',
  p_note text default ''
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare p public.products%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY'; end if;
  if p_price is null or p_price < 0 then raise exception 'INVALID_PRICE'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  update public.products
    set qty=p.qty+p_qty, buy=p_price, updated_by=auth.uid(), updated_at=now()
    where id=p_product_id;
  insert into public.purchases(product_id,name,qty,price,dealer,invoice,note,created_by)
    values(p.id,p.name,p_qty,p_price,coalesce(p_dealer,''),coalesce(p_invoice,''),coalesce(p_note,''),auth.uid());
end;
$$;

grant execute on function public.record_purchase(uuid,numeric,numeric,text,text,text) to authenticated;


create unique index if not exists products_barcode_unique on public.products (barcode) where nullif(trim(barcode),'') is not null;
create unique index if not exists products_code_unique on public.products (code) where nullif(trim(code),'') is not null;
notify pgrst, 'reload schema';
