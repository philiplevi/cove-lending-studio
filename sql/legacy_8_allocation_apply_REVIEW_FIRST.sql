-- Cove V3.7 — OPTIONAL ONE-TIME HISTORICAL ALLOCATION CORRECTION.
-- DO NOT execute until:
--   1) an independent, restorable database backup has been verified;
--   2) legacy_8_allocation_preview.sql returns exactly eight READY rows
--      for one confirmed Cove workspace;
--   3) the actual receipt evidence supports the proposed principal/interest
--      reallocations; and
--   4) the workspace owner explicitly approves the correction.
-- NOTE: Running this script WILL UPDATE eight original imported receipt
-- allocation columns and INSERT audit_log entries; gross amounts, dates,
-- receipts, cash, loan terms and outstanding cash movements stay unchanged.
-- It is NOT part of the application migration. It must be applied manually.
BEGIN;
DO $cove_legacy_fix$
DECLARE
 target record;
 loan_row public.loans%ROWTYPE;
 receipt_row public.payments%ROWTYPE;
 target_workspace uuid;
 workspace_matches integer;
 paid_principal bigint;
 paid_interest bigint;
 paid_gross bigint;
 affected integer;
 original_reallocation jsonb;
BEGIN
  -- Eight receipt/loan combinations are identified from the archived source.
  -- The procedure refuses to run if the target set changed in production.
  SELECT count(*),(array_agg(s.workspace_id))[1] INTO workspace_matches,target_workspace
  FROM (
    SELECT p.workspace_id
    FROM (VALUES ('LN0003','R000014'),('LN0010','R000032'),('LN0012','R000046'),('LN0013','R000043'),
                 ('LN0016','R000057'),('LN0020','R000070'),('LN0023','R000080'),('LN0029','R000077'))
      AS target(loan_id,receipt_id)
    JOIN public.payments p ON p.loan_id=target.loan_id AND p.id=target.receipt_id
    JOIN public.loans l ON l.workspace_id=p.workspace_id AND l.id=target.loan_id
    JOIN public.legacy_baselines b ON b.workspace_id=p.workspace_id
    WHERE l.source='Imported workbook' AND p.source='Imported workbook'
    GROUP BY p.workspace_id HAVING count(*)=8
  ) s;
  IF workspace_matches<>1 THEN
    RAISE EXCEPTION 'Expected exactly one legacy workspace containing all eight original receipts; found %',workspace_matches;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(target_workspace::text));

  FOR target IN SELECT * FROM (VALUES
       ('LN0003','R000014'),('LN0010','R000032'),('LN0012','R000046'),('LN0013','R000043'),
       ('LN0016','R000057'),('LN0020','R000070'),('LN0023','R000080'),('LN0029','R000077')) AS t(loan_id,receipt_id)
  LOOP
    SELECT * INTO STRICT loan_row FROM public.loans
      WHERE workspace_id=target_workspace AND id=target.loan_id FOR UPDATE;
    SELECT * INTO STRICT receipt_row FROM public.payments
      WHERE workspace_id=target_workspace AND id=target.receipt_id AND loan_id=target.loan_id FOR UPDATE;
    SELECT COALESCE(SUM(principal_cents),0),COALESCE(SUM(interest_cents),0),COALESCE(SUM(amount_cents),0)
      INTO paid_principal,paid_interest,paid_gross FROM public.payments
      WHERE workspace_id=target_workspace AND loan_id=target.loan_id;
    IF loan_row.source<>'Imported workbook' OR receipt_row.source<>'Imported workbook'
       OR receipt_row.amount_cents<=0 OR receipt_row.principal_cents<100
       OR paid_principal-loan_row.principal_cents<>100
       OR loan_row.interest_cents-paid_interest<>100
       OR paid_gross<>loan_row.payable_cents
       OR EXISTS(SELECT 1 FROM public.payments p WHERE p.workspace_id=target_workspace
                  AND p.loan_id=target.loan_id AND (p.amount_cents<0 OR p.reverses_id IS NOT NULL))
       OR EXISTS(SELECT 1 FROM public.loan_corrections c WHERE c.workspace_id=target_workspace AND c.loan_id=target.loan_id)
       OR EXISTS(SELECT 1 FROM public.loan_voids v WHERE v.workspace_id=target_workspace AND v.loan_id=target.loan_id)
    THEN RAISE EXCEPTION 'Source no longer matches the verified ₱1 exception for loan %, receipt %; NO CHANGES SAVED',target.loan_id,target.receipt_id;
    END IF;
  END LOOP;
  -- All preconditions passed. PostgreSQL's transaction is atomic: any error rolls back everything.
  FOR target IN SELECT * FROM (VALUES
       ('LN0003','R000014'),('LN0010','R000032'),('LN0012','R000046'),('LN0013','R000043'),
       ('LN0016','R000057'),('LN0020','R000070'),('LN0023','R000080'),('LN0029','R000077')) AS t(loan_id,receipt_id)
  LOOP
    SELECT * INTO STRICT receipt_row FROM public.payments
      WHERE workspace_id=target_workspace AND id=target.receipt_id AND loan_id=target.loan_id FOR UPDATE;
    original_reallocation:=jsonb_build_object('before_principal_cents',receipt_row.principal_cents,
      'before_interest_cents',receipt_row.interest_cents,
      'after_principal_cents',receipt_row.principal_cents-100,
      'after_interest_cents',receipt_row.interest_cents+100,
      'unchanged_amount_cents',receipt_row.amount_cents,
      'reason','Historical workbook: ₱1 principal overallocation / ₱1 interest underallocation; confirmed against source receipt',
      'action_type','manual_owner_approved_sql_correction','source','Cove V3.7 legacy ₱8 allocation review');
    UPDATE public.payments
       SET principal_cents=principal_cents-100,
           interest_cents=interest_cents+100
     WHERE workspace_id=target_workspace AND id=target.receipt_id AND loan_id=target.loan_id;
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>1 THEN RAISE EXCEPTION 'Receipt % was not uniquely updated; rollback',target.receipt_id; END IF;
    INSERT INTO public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
    VALUES(target_workspace,NULL,'CORRECT_LEGACY_RECEIPT_ALLOCATION','payment',target.receipt_id,
      original_reallocation||jsonb_build_object('loan_id',target.loan_id));
  END LOOP;
  RAISE NOTICE 'Eight historical ₱1 allocations corrected in workspace %. Gross receipts and cash unchanged. Verify Data Integrity again.',target_workspace;
END;
$cove_legacy_fix$;
COMMIT;
-- Following COMMIT, rerun read-only Data Integrity. The original workbook
-- and previous allocation entries remain traceable through audit_log.
