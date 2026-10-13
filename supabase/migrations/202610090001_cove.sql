-- Cove Lending Cloud — initial single-owner tenancy, private ledger, historical migration.
-- Run in a NEW Supabase project. Never paste a service_role secret in browser code.
create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null default 'Cove Lending',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','viewer')),
  primary key (workspace_id,user_id)
);
create table public.borrowers (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null, name text not null, contact text not null default '', status text not null default 'Active',
  created_at timestamptz not null default now(), primary key(workspace_id,id)
);
create table public.products (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null, name text not null, monthly_rate numeric(12,8) not null check(monthly_rate>=0 and monthly_rate<=1),
  max_per_loan_cents bigint, max_portfolio text, description text,
  primary key(workspace_id,id)
);
create table public.loans (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null, borrower_id text not null, product_id text not null,
  release_date date not null, principal_cents bigint not null check(principal_cents>0),
  monthly_rate numeric(12,8) not null, term_months integer not null check(term_months between 1 and 120),
  interest_cents bigint not null check(interest_cents>=0), payable_cents bigint not null check(payable_cents>=principal_cents),
  imported_status text, source text not null default 'New entry', created_at timestamptz not null default now(),
  primary key(workspace_id,id), foreign key(workspace_id,borrower_id) references public.borrowers(workspace_id,id),
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  check(payable_cents=principal_cents+interest_cents)
);
create index loans_workspace_date on public.loans(workspace_id,release_date);
create table public.installments (
  workspace_id uuid not null, loan_id text not null, installment_no integer not null,
  due_date date not null, amount_cents bigint not null check(amount_cents>=0),
  primary key(workspace_id,loan_id,installment_no),
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id)
);
create table public.payments (
  workspace_id uuid not null, id text not null, loan_id text not null,
  paid_on date not null, amount_cents bigint not null check(amount_cents<>0),
  principal_cents bigint not null, interest_cents bigint not null,
  method text not null, notes text not null default '', reverses_id text,
  source_ref text, source text not null default 'New entry',
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  primary key(workspace_id,id), foreign key(workspace_id,loan_id) references public.loans(workspace_id,id),
  foreign key(workspace_id,reverses_id) references public.payments(workspace_id,id),
  check(amount_cents=principal_cents+interest_cents),
  check((amount_cents>0 and principal_cents>=0 and interest_cents>=0) or (amount_cents<0 and principal_cents<=0 and interest_cents<=0))
);
create unique index payments_one_reversal on public.payments(workspace_id,reverses_id) where reverses_id is not null;
create index payments_workspace_date on public.payments(workspace_id,paid_on);
create table public.capital (
  workspace_id uuid not null references public.workspaces(id), id text not null,
  occurred_on date not null, amount_cents bigint not null check(amount_cents>0),
  source_type text not null, notes text not null default '', funding_interest_cents bigint not null default 0,
  status text not null default 'Active', created_at timestamptz not null default now(),
  primary key(workspace_id,id)
);
create table public.outflows (
  workspace_id uuid not null references public.workspaces(id), id text not null,
  occurred_on date not null, amount_cents bigint not null check(amount_cents>0),
  category text not null, classification text not null, description text not null, notes text not null default '',
  created_at timestamptz not null default now(), primary key(workspace_id,id)
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id), actor_id uuid references auth.users(id),
  action text not null, entity text not null, entity_id text not null, details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_workspace_date on public.audit_log(workspace_id,occurred_at desc);
create table public.legacy_baselines (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  source_name text not null, baseline jsonb not null, imported_at timestamptz not null default now()
);

-- DENY writes from browsers: application mutations go through transaction-safe RPCs only.
do $$ declare t text; begin
  foreach t in array array['workspaces','workspace_members','borrowers','products','loans','installments','payments','capital','outflows','audit_log','legacy_baselines'] loop
    execute format('alter table public.%I enable row level security',t);
    if t='workspace_members' then
      execute 'create policy member_read on public.workspace_members for select to authenticated using (user_id=auth.uid())';
    elsif t='workspaces' then
      execute 'create policy workspace_read on public.workspaces for select to authenticated using (id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid()))';
    else
      execute format('create policy workspace_read on public.%I for select to authenticated using (workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid()))',t);
    end if;
  end loop;
end $$;

-- Registration creates a private workspace and four source-compatible product definitions.
create function public.cove_on_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
  insert into public.workspaces(name,created_by) values('Cove Lending',new.id) returning id into w;
  insert into public.workspace_members(workspace_id,user_id,role) values(w,new.id,'owner');
  insert into public.products(workspace_id,id,name,monthly_rate,max_per_loan_cents,max_portfolio,description)
  values (w,'LT01','Regular Loan A',0.10,1000000,'No Limit','Regular'),
         (w,'LT02','Regular Loan B',0.07,1000000,'No Limit','Acquaintance or with Referral'),
         (w,'LT03','Pastoral Loan',0,1000000,'No Limit',''),
         (w,'LT04','Needy Loan',0,1000000,'No Limit','');
  return new;
end $$;
create trigger on_auth_user_created_cove after insert on auth.users for each row execute function public.cove_on_signup();

-- All financial write procedures run with one workspace-scoped transactional lock.
create function public.cove_assert_owner(w uuid) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='owner'
  ) then raise exception 'Not authorized for this workspace' using errcode='42501'; end if;
end $$;
create function public.cove_next_id(w uuid,t text, prefix text, minwidth int) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
  if t not in ('borrowers','loans','payments','capital','outflows') then raise exception 'Invalid sequence'; end if;
  execute format('select coalesce(max(substring(id from ''[0-9]+$'')::int),0)+1 from public.%I where workspace_id=$1 and id ~ $2',t)
  into n using w, ('^'||prefix||'[0-9]+$');
  return prefix||lpad(n::text,minwidth,'0');
end $$;
create function public.cove_cash(w uuid, cutoff date) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
select (select coalesce(sum(amount_cents),0) from public.capital where workspace_id=w and occurred_on<=cutoff)
 - (select coalesce(sum(principal_cents),0) from public.loans where workspace_id=w and release_date<=cutoff)
 + (select coalesce(sum(amount_cents),0) from public.payments where workspace_id=w and paid_on<=cutoff)
 - (select coalesce(sum(amount_cents),0) from public.outflows where workspace_id=w and occurred_on<=cutoff);
$$;

-- Atomic creation, cash safeguards, original manual payment splits, immutable reversals.
create function public.cove_post(w uuid, action text, v jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rid text; l public.loans%rowtype; pr public.products%rowtype;
  amt bigint; pi bigint; it bigint; total bigint; n int; i int; term int; paid bigint; used_pi bigint; used_it bigint;
  occurred date; first_due date; freq text; source text; class text; method text; details jsonb;
  previous public.payments%rowtype;
begin
  perform public.cove_assert_owner(w); perform pg_advisory_xact_lock(hashtext(w::text));
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'Invalid input'; end if;
  if action='borrower' then
    if length(trim(coalesce(v->>'name',''))) not between 2 and 120 then raise exception 'Borrower name should be 2–120 characters'; end if;
    rid:=public.cove_next_id(w,'borrowers','C',3);
    insert into public.borrowers(workspace_id,id,name,contact) values(w,rid,trim(v->>'name'),left(coalesce(v->>'contact',''),300));
    details=jsonb_build_object('name',v->>'name');
  elsif action='loan' then
    select * into pr from public.products where workspace_id=w and id=v->>'product_id';
    if not found or not exists(select 1 from public.borrowers where workspace_id=w and id=v->>'borrower_id') then raise exception 'Select an existing borrower and product'; end if;
    amt:=round((v->>'principal')::numeric*100)::bigint;
    if amt<=0 or (pr.max_per_loan_cents is not null and amt>pr.max_per_loan_cents) then raise exception 'Principal must be positive and within product limit'; end if;
    term:=(v->>'term_months')::integer;
    if term not between 1 and 36 then raise exception 'Term must be 1–36 months'; end if;
    occurred:=(v->>'release_date')::date;first_due:=(v->>'first_due_date')::date;
    if occurred is null or occurred>(now() at time zone 'Asia/Manila')::date or first_due<=occurred then raise exception 'Invalid loan release or first due date'; end if;
    if public.cove_cash(w,(now() at time zone 'Asia/Manila')::date)<amt then raise exception 'Insufficient fund cash'; end if;
    freq:=coalesce(v->>'frequency','Semi-monthly');
    if freq not in ('Semi-monthly','Monthly') then raise exception 'Invalid repayment frequency'; end if;
    it:=round(amt*pr.monthly_rate*term)::bigint;total:=amt+it;n:=term*(case when freq='Monthly' then 1 else 2 end);
    rid:=public.cove_next_id(w,'loans','LN',4);
    insert into public.loans(workspace_id,id,borrower_id,product_id,release_date,principal_cents,monthly_rate,term_months,interest_cents,payable_cents,imported_status,source)
    values(w,rid,v->>'borrower_id',pr.id,occurred,amt,pr.monthly_rate,term,it,total,'Active','New entry');
    for i in 0..n-1 loop
      insert into public.installments(workspace_id,loan_id,installment_no,due_date,amount_cents)
      values(w,rid,i+1, case when freq='Monthly' then (first_due+make_interval(months=>i))::date else first_due+(i*15) end,
        (total/n)::bigint+case when i<(total%n) then 1 else 0 end);
    end loop;
    details=jsonb_build_object('principal_cents',amt,'interest_cents',it,'total_payable_cents',total,'installments',n);
  elsif action='payment' then
    select * into l from public.loans where workspace_id=w and id=v->>'loan_id';
    if not found then raise exception 'Loan not found'; end if;
    occurred:=(v->>'date')::date;
    if occurred<l.release_date or occurred>(now() at time zone 'Asia/Manila')::date then raise exception 'Payment date must be within active history'; end if;
    amt:=round((v->>'amount')::numeric*100)::bigint;pi:=round((v->>'principal')::numeric*100)::bigint;it:=round((v->>'interest')::numeric*100)::bigint;
    if amt<=0 or pi<0 or it<0 or pi+it<>amt then raise exception 'Payment allocations do not equal receipt amount'; end if;
    select coalesce(sum(amount_cents),0),coalesce(sum(principal_cents),0),coalesce(sum(interest_cents),0)
      into paid,used_pi,used_it from public.payments where workspace_id=w and loan_id=l.id;
    if amt>l.payable_cents-paid or pi>l.principal_cents-used_pi or it>l.interest_cents-used_it then
      raise exception 'Payment exceeds remaining contractual principal or interest'; end if;
    rid:=public.cove_next_id(w,'payments','R',6);method:=left(coalesce(nullif(trim(v->>'method'),''),'Bank Transfer'),80);
    insert into public.payments(workspace_id,id,loan_id,paid_on,amount_cents,principal_cents,interest_cents,method,notes,source_ref,source,created_by)
    values(w,rid,l.id,occurred,amt,pi,it,method,left(coalesce(v->>'notes',''),1000),rid,'New entry',auth.uid());
    details=jsonb_build_object('loan_id',l.id,'amount_cents',amt,'principal_cents',pi,'interest_cents',it);
  elsif action='reverse' then
    select * into previous from public.payments where workspace_id=w and id=v->>'id';
    if not found or previous.amount_cents<0 or previous.reverses_id is not null then raise exception 'Eligible payment not found'; end if;
    if exists(select 1 from public.payments where workspace_id=w and reverses_id=previous.id) then raise exception 'Receipt already reversed'; end if;
    if length(trim(coalesce(v->>'reason','')))<5 then raise exception 'Provide an explanation of at least 5 characters'; end if;
    rid:=public.cove_next_id(w,'payments','R',6);
    insert into public.payments(workspace_id,id,loan_id,paid_on,amount_cents,principal_cents,interest_cents,method,notes,reverses_id,source_ref,source,created_by)
    values(w,rid,previous.loan_id,(now() at time zone 'Asia/Manila')::date,-previous.amount_cents,-previous.principal_cents,-previous.interest_cents,previous.method,'REVERSAL: '||left(v->>'reason',990),previous.id,rid,'Reversal',auth.uid());
    details=jsonb_build_object('reversed_id',previous.id,'reason',v->>'reason');
  elsif action='capital' then
    amt:=round((v->>'amount')::numeric*100)::bigint;occurred:=(v->>'date')::date;source:=coalesce(v->>'source','Personal');
    if amt<=0 or occurred>(now() at time zone 'Asia/Manila')::date or source not in ('Personal','Loan','Investor','Other') then raise exception 'Invalid capital entry'; end if;
    rid:=public.cove_next_id(w,'capital','CI',3);
    insert into public.capital(workspace_id,id,occurred_on,amount_cents,source_type,notes) values(w,rid,occurred,amt,source,left(coalesce(v->>'notes',''),1000));
    details=jsonb_build_object('amount_cents',amt,'source',source);
  elsif action='outflow' then
    amt:=round((v->>'amount')::numeric*100)::bigint;occurred:=(v->>'date')::date;
    class:=coalesce(v->>'classification','Owner withdrawal');
    if amt<=0 or occurred>(now() at time zone 'Asia/Manila')::date or class not in ('Owner withdrawal','Operating expense','Financing cost','Capital repayment','Other cash outflow') then raise exception 'Invalid outflow'; end if;
    if amt>public.cove_cash(w,(now() at time zone 'Asia/Manila')::date) then raise exception 'Insufficient fund cash'; end if;
    if length(trim(coalesce(v->>'description','')))=0 then raise exception 'Description required'; end if;
    rid:=public.cove_next_id(w,'outflows','D',6);
    insert into public.outflows(workspace_id,id,occurred_on,amount_cents,category,classification,description,notes)
    values(w,rid,occurred,amt,left(coalesce(v->>'category','Withdrawal'),90),class,left(v->>'description',240),left(coalesce(v->>'notes',''),1000));
    details=jsonb_build_object('amount_cents',amt,'classification',class);
  else raise exception 'Unknown ledger action'; end if;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
  values(w,auth.uid(),case when action='reverse' then 'REVERSE' else 'CREATE' end,action,rid,details);
  return jsonb_build_object('id',rid,'ok',true)||details;
end $$;

-- One-time all-or-nothing import. Preserves original historical allocations and source reference anomalies.
create function public.cove_import_legacy(w uuid, doc jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b jsonb; l jsonb; p jsonb; c jsonb; f jsonb; d jsonb; due text; pos int; n int; principal bigint; payable bigint; amt bigint;
begin
  perform public.cove_assert_owner(w); perform pg_advisory_xact_lock(hashtext(w::text));
  if exists(select 1 from public.legacy_baselines where workspace_id=w)
     or exists(select 1 from public.loans where workspace_id=w)
     or exists(select 1 from public.payments where workspace_id=w)
     or exists(select 1 from public.capital where workspace_id=w)
     or exists(select 1 from public.outflows where workspace_id=w) then raise exception 'Workspace already contains a ledger or completed import'; end if;
  if doc is null or jsonb_typeof(doc) <> 'object'
    or jsonb_typeof(doc->'borrowers') <> 'array' or jsonb_typeof(doc->'products') <> 'array'
    or jsonb_typeof(doc->'loans') <> 'array' or jsonb_typeof(doc->'payments') <> 'array'
    or jsonb_typeof(doc->'capital') <> 'array' or jsonb_typeof(doc->'outflows') <> 'array'
    or jsonb_array_length(doc->'loans') > 1000 or jsonb_array_length(doc->'payments') > 20000 then raise exception 'Invalid or oversized migration dataset'; end if;
  for p in select value from jsonb_array_elements(doc->'products') loop
    insert into public.products(workspace_id,id,name,monthly_rate,max_per_loan_cents,max_portfolio,description)
    values(w,p->>'id',p->>'name',(p->>'monthly_rate')::numeric,round((p->>'max_per_loan')::numeric*100)::bigint,p->>'max_portfolio',p->>'description')
    on conflict(workspace_id,id) do update set name=excluded.name,monthly_rate=excluded.monthly_rate,
      max_per_loan_cents=excluded.max_per_loan_cents,max_portfolio=excluded.max_portfolio,description=excluded.description;
  end loop;
  for b in select value from jsonb_array_elements(doc->'borrowers') loop
    insert into public.borrowers(workspace_id,id,name,contact,status) values(w,b->>'id',b->>'name',coalesce(b->>'contact',''),coalesce(b->>'status','Active'));
  end loop;
  for l in select value from jsonb_array_elements(doc->'loans') loop
    principal:=round((l->>'principal')::numeric*100)::bigint;
    payable:=round((l->>'total_payable')::numeric*100)::bigint;
    insert into public.loans(workspace_id,id,borrower_id,product_id,release_date,principal_cents,monthly_rate,term_months,interest_cents,payable_cents,imported_status,source)
    values(w,l->>'id',l->>'borrower_id',l->>'product_id',(l->>'release_date')::date,principal,(l->>'monthly_rate')::numeric,(l->>'term_months')::int,
      round((l->>'total_interest')::numeric*100)::bigint,payable,l->>'imported_status','Imported workbook');
    n:=jsonb_array_length(l->'schedule');
    if n < 1 then raise exception 'Loan % has no installment schedule',l->>'id'; end if;
    pos:=0;
    for due in select jsonb_array_elements_text(l->'schedule') loop
      insert into public.installments(workspace_id,loan_id,installment_no,due_date,amount_cents)
      values(w,l->>'id',pos+1,due::date,(payable/n)+case when pos < (payable%n) then 1 else 0 end);
      pos:=pos+1;
    end loop;
  end loop;
  for b in select value from jsonb_array_elements(doc->'payments') loop
    insert into public.payments(workspace_id,id,loan_id,paid_on,amount_cents,principal_cents,interest_cents,method,notes,source_ref,source)
    values(w,b->>'id',b->>'loan_id',(b->>'date')::date,round((b->>'amount')::numeric*100)::bigint,
      round((b->>'principal')::numeric*100)::bigint,round((b->>'interest')::numeric*100)::bigint,
      coalesce(b->>'method','Bank Transfer'),coalesce(b->>'notes',''),coalesce(b->>'source_id',b->>'id'),'Imported workbook');
  end loop;
  for c in select value from jsonb_array_elements(doc->'capital') loop
    insert into public.capital(workspace_id,id,occurred_on,amount_cents,source_type,notes,funding_interest_cents,status)
    values(w,c->>'id',(c->>'date')::date,round((c->>'amount')::numeric*100)::bigint,c->>'source',coalesce(c->>'notes',''),
      round(coalesce((c->>'monthly_interest_expense')::numeric,0)*100)::bigint,coalesce(c->>'status','Active'));
  end loop;
  for d in select value from jsonb_array_elements(doc->'outflows') loop
    insert into public.outflows(workspace_id,id,occurred_on,amount_cents,category,classification,description,notes)
    values(w,d->>'id',(d->>'date')::date,round((d->>'amount')::numeric*100)::bigint,d->>'category',d->>'classification',d->>'description',coalesce(d->>'notes',''));
  end loop;
  insert into public.legacy_baselines(workspace_id,source_name,baseline)
    values(w,coalesce(doc->'metadata'->>'source','Legacy workbook'),doc->'spreadsheet_summary');
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
    values(w,auth.uid(),'IMPORT','dataset','legacy',jsonb_build_object('borrowers',jsonb_array_length(doc->'borrowers'),
    'loans',jsonb_array_length(doc->'loans'),'payments',jsonb_array_length(doc->'payments')));
  return jsonb_build_object('ok',true,'loans',jsonb_array_length(doc->'loans'),'payments',jsonb_array_length(doc->'payments'));
end $$;

-- Defense in depth: do not grant browser roles direct financial writes.
revoke insert, update, delete, truncate, references, trigger on
  public.workspaces, public.workspace_members, public.borrowers, public.products, public.loans,
  public.installments, public.payments, public.capital, public.outflows, public.audit_log,
  public.legacy_baselines from anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.borrowers, public.products,
  public.loans, public.installments, public.payments, public.capital, public.outflows,
  public.audit_log, public.legacy_baselines to authenticated;

-- Disallow anonymous/direct RPC access; use authenticated session only.
revoke all on function public.cove_on_signup() from public;
revoke all on function public.cove_assert_owner(uuid) from public;
revoke all on function public.cove_next_id(uuid,text,text,int) from public;
revoke all on function public.cove_cash(uuid,date) from public;
revoke all on function public.cove_post(uuid,text,jsonb) from public;
revoke all on function public.cove_import_legacy(uuid,jsonb) from public;
grant execute on function public.cove_post(uuid,text,jsonb) to authenticated;
grant execute on function public.cove_import_legacy(uuid,jsonb) to authenticated;
