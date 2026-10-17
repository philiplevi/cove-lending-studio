-- COVE 3.0 additive operations migration; apply after V2.3. No legacy rows edited.
-- Cash-account assignments and reconciliations are MEMORANDUM records only.
-- They never create, alter, or delete ledger cash transactions.

create table if not exists public.loan_extensions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  loan_id text not null, effective_on date not null,
  previous_maturity date not null, new_maturity date not null,
  reason text not null, actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id),
  check(new_maturity > previous_maturity), check(length(trim(reason)) between 10 and 500)
);
create index if not exists cove_extensions_workspace on public.loan_extensions(workspace_id,loan_id,effective_on,created_at);

create table if not exists public.cash_accounts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null, kind text not null check (kind in ('Cash','Bank','E-wallet')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,name),
  check(length(trim(name)) between 2 and 80)
);
create table if not exists public.cash_allocations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  account_id uuid not null, source_kind text not null check(source_kind in ('loan','payment','capital','outflow','loan_void')),
  source_id text not null, occurred_on date not null,
  signed_amount_cents bigint not null check (signed_amount_cents<>0),
  actor_id uuid references auth.users(id), created_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,source_kind,source_id),
  foreign key(workspace_id,account_id) references public.cash_accounts(workspace_id,id)
);
create index if not exists cove_allocations_account_date on public.cash_allocations(workspace_id,account_id,occurred_on);
create table if not exists public.account_reconciliations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  account_id uuid not null, as_of date not null,
  observed_balance_cents bigint not null,
  mapped_balance_cents bigint not null,
  difference_cents bigint not null,
  notes text not null default '', actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(workspace_id,id),
  foreign key(workspace_id,account_id) references public.cash_accounts(workspace_id,id),
  check(length(notes)<=500)
);
create table if not exists public.collection_followups (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  loan_id text not null, followup_on date not null,
  channel text not null check(channel in ('Call','SMS draft','Email draft','In person','Other')),
  outcome text not null check(outcome in ('Planned','Contacted','Promise to pay','No response','Completed')),
  promise_date date, notes text not null default '',
  actor_id uuid references auth.users(id), created_at timestamptz not null default now(),
  primary key(workspace_id,id),
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id),
  check(length(notes)<=500)
);
create table if not exists public.servicing_notes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  loan_id text not null,
  request_type text not null check(request_type in ('Renewal inquiry','Interest waiver request','Restructure request','Other')),
  notes text not null, status text not null default 'For review',
  actor_id uuid references auth.users(id), created_at timestamptz not null default now(),
  primary key(workspace_id,id),
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id),
  check(length(trim(notes)) between 10 and 500)
);

-- Row-level read by workspace members. Writes only via owner-checked RPC.
do $$ declare t text; begin
 foreach t in array array['loan_extensions','cash_accounts','cash_allocations','account_reconciliations','collection_followups','servicing_notes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists cove_v3_read on public.%I',t);
  execute format('create policy cove_v3_read on public.%I for select to authenticated using (workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid()))',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.cove_operations(w uuid, action text, v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  today_ph date := (now() at time zone 'Asia/Manila')::date;
  loan public.loans%rowtype;
  account public.cash_accounts%rowtype;
  ref text; source_kind text; previous_date date; next_date date; source_date date;
  source_amount bigint; net_paid bigint; prior_due bigint;
  observed bigint; mapped bigint; note text; result_id uuid; existing_maturity date;
  record_kind text;
begin
  perform public.cove_assert_owner(w);
  perform pg_advisory_xact_lock(hashtext(w::text));
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'JSON object required'; end if;
  note := trim(coalesce(v->>'notes',v->>'reason',''));

  if action='create_account' then
    if length(trim(coalesce(v->>'name',''))) not between 2 and 80 or v->>'kind' not in ('Cash','Bank','E-wallet') then
      raise exception 'Provide account name (2–80 characters) and valid type'; end if;
    insert into public.cash_accounts(workspace_id,name,kind)
    values(w,trim(v->>'name'),v->>'kind') returning id into result_id;
    ref:=result_id::text;

  elsif action='assign_cash' then
    select * into account from public.cash_accounts where workspace_id=w and id=(v->>'account_id')::uuid;
    if not found then raise exception 'Cash account not found'; end if;
    source_kind:=v->>'source_kind'; ref:=trim(coalesce(v->>'source_id',''));
    if source_kind='loan' then
      select release_date,-principal_cents into source_date,source_amount from public.loans where workspace_id=w and id=ref;
    elsif source_kind='payment' then
      select paid_on,amount_cents into source_date,source_amount from public.payments where workspace_id=w and id=ref;
    elsif source_kind='capital' then
      select occurred_on,amount_cents into source_date,source_amount from public.capital where workspace_id=w and id=ref;
    elsif source_kind='outflow' then
      select occurred_on,-amount_cents into source_date,source_amount from public.outflows where workspace_id=w and id=ref;
    elsif source_kind='loan_void' then
      select voided_on,principal_cents into source_date,source_amount from public.loan_voids where workspace_id=w and loan_id=ref;
    else raise exception 'Unsupported ledger transaction kind'; end if;
    if source_date is null or source_amount is null or source_amount=0 then raise exception 'Transaction not found'; end if;
    if source_date>today_ph then raise exception 'Cannot assign future transaction'; end if;
    insert into public.cash_allocations(workspace_id,account_id,source_kind,source_id,occurred_on,signed_amount_cents,actor_id)
    values(w,account.id,source_kind,ref,source_date,source_amount,auth.uid()) returning id into result_id;
    ref:=result_id::text;

  elsif action='reconcile_account' then
    select * into account from public.cash_accounts where workspace_id=w and id=(v->>'account_id')::uuid;
    if not found then raise exception 'Cash account not found'; end if;
    source_date:=(v->>'as_of')::date;
    if source_date is null or source_date>today_ph then raise exception 'Invalid reconciliation date'; end if;
    if (v->>'observed_balance') !~ '^[-]?[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'Invalid statement balance'; end if;
    observed:=round((v->>'observed_balance')::numeric*100)::bigint;
    select coalesce(sum(signed_amount_cents),0) into mapped from public.cash_allocations
      where workspace_id=w and account_id=account.id and occurred_on<=source_date;
    if length(note)>500 then raise exception 'Notes too long'; end if;
    insert into public.account_reconciliations(workspace_id,account_id,as_of,observed_balance_cents,mapped_balance_cents,difference_cents,notes,actor_id)
    values(w,account.id,source_date,observed,mapped,observed-mapped,note,auth.uid()) returning id into result_id;
    ref:=result_id::text;

  elsif action='extend_loan' then
    select * into loan from public.loans where workspace_id=w and id=v->>'loan_id' for update;
    if not found then raise exception 'Loan not found'; end if;
    if exists (select 1 from public.loan_voids where workspace_id=w and loan_id=loan.id) then raise exception 'Voided loan cannot be extended'; end if;
    select coalesce(sum(amount_cents),0) into net_paid from public.payments where workspace_id=w and loan_id=loan.id;
    if net_paid >= loan.payable_cents then raise exception 'Settled loan cannot be extended'; end if;
    if exists(select 1 from public.loan_extensions where workspace_id=w and loan_id=loan.id) then
      raise exception 'Further extensions require a versioned schedule review; one extension is supported in V3.0';
    end if;
    select coalesce(sum(i.amount_cents),0) into prior_due from public.installments i
      where i.workspace_id=w and i.loan_id=loan.id
        and (i.due_date + coalesce((select sum(e.new_maturity - e.previous_maturity)
          from public.loan_extensions e where e.workspace_id=w and e.loan_id=i.loan_id
          and i.due_date>=e.effective_on),0)) < today_ph;
    if prior_due>net_paid then raise exception 'Existing overdue installments require manual review before extension'; end if;
    select coalesce((select new_maturity from public.loan_extensions where workspace_id=w and loan_id=loan.id order by created_at desc,id desc limit 1),
      (select max(due_date) from public.installments where workspace_id=w and loan_id=loan.id)) into previous_date;
    next_date:=(v->>'new_maturity')::date;
    if next_date is null or next_date<=previous_date or next_date>previous_date+365 then raise exception 'New maturity must extend existing maturity by 1–365 days'; end if;
    if v->>'expected_maturity' is distinct from previous_date::text then raise exception 'Maturity changed; refresh before extending'; end if;
    if length(note) not between 10 and 500 then raise exception 'Provide reason (10–500 characters)'; end if;
    insert into public.loan_extensions(workspace_id,loan_id,effective_on,previous_maturity,new_maturity,reason,actor_id)
      values(w,loan.id,today_ph,previous_date,next_date,note,auth.uid()) returning id into result_id;
    ref:=result_id::text;

  elsif action='followup' then
    select * into loan from public.loans where workspace_id=w and id=v->>'loan_id';
    if not found then raise exception 'Loan not found'; end if;
    if exists (select 1 from public.loan_voids where workspace_id=w and loan_id=loan.id) then raise exception 'Cannot follow up voided loan'; end if;
    source_date:=(v->>'date')::date;
    if source_date is null or source_date>today_ph then raise exception 'Follow-up date cannot be in future'; end if;
    if v->>'channel' not in ('Call','SMS draft','Email draft','In person','Other') or
       v->>'outcome' not in ('Planned','Contacted','Promise to pay','No response','Completed') then raise exception 'Invalid follow-up channel or outcome'; end if;
    if length(note)>500 then raise exception 'Notes too long'; end if;
    next_date:=nullif(v->>'promise_date','')::date;
    insert into public.collection_followups(workspace_id,loan_id,followup_on,channel,outcome,promise_date,notes,actor_id)
    values(w,loan.id,source_date,v->>'channel',v->>'outcome',next_date,note,auth.uid()) returning id into result_id;
    ref:=result_id::text;

  elsif action='servicing_note' then
    select * into loan from public.loans where workspace_id=w and id=v->>'loan_id';
    if not found then raise exception 'Loan not found'; end if;
    if v->>'request_type' not in ('Renewal inquiry','Interest waiver request','Restructure request','Other') then raise exception 'Invalid request type'; end if;
    if length(note) not between 10 and 500 then raise exception 'Provide details (10–500 characters)'; end if;
    insert into public.servicing_notes(workspace_id,loan_id,request_type,notes,actor_id)
    values(w,loan.id,v->>'request_type',note,auth.uid()) returning id into result_id;
    ref:=result_id::text;
  else
    raise exception 'Unsupported Cove operations action';
  end if;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
  values(w,auth.uid(),'OPS_'||upper(action),'operations',ref,jsonb_build_object('action',action,'input',v));
  return jsonb_build_object('ok',true,'id',ref,'action',action);
end $$;
revoke all on function public.cove_operations(uuid,text,jsonb) from public,anon;
grant execute on function public.cove_operations(uuid,text,jsonb) to authenticated;
