-- Cove V3.7 — READ-ONLY PREVIEW of the historical ₱8 allocation discrepancy.
-- Run in the intended Supabase project SQL Editor. This script makes NO changes.
-- The eight IDs refer only to the original imported workbook's settled loans.
WITH targets(loan_id, receipt_id) AS (
 VALUES ('LN0003','R000014'),('LN0010','R000032'),('LN0012','R000046'),('LN0013','R000043'),
        ('LN0016','R000057'),('LN0020','R000070'),('LN0023','R000080'),('LN0029','R000077')
),
matched AS (
 SELECT t.loan_id,t.receipt_id,l.workspace_id,l.principal_cents AS loan_principal_cents,
        l.interest_cents AS loan_interest_cents,l.payable_cents,l.source AS loan_source,
        p.amount_cents AS receipt_total_cents,p.principal_cents AS receipt_principal_cents,
        p.interest_cents AS receipt_interest_cents,p.source AS receipt_source,
        (SELECT COALESCE(SUM(x.principal_cents),0) FROM public.payments x
         WHERE x.workspace_id=l.workspace_id AND x.loan_id=l.id) AS all_principal_cents,
        (SELECT COALESCE(SUM(x.interest_cents),0) FROM public.payments x
         WHERE x.workspace_id=l.workspace_id AND x.loan_id=l.id) AS all_interest_cents,
        (SELECT COALESCE(SUM(x.amount_cents),0) FROM public.payments x
         WHERE x.workspace_id=l.workspace_id AND x.loan_id=l.id) AS all_receipts_cents,
        EXISTS(SELECT 1 FROM public.payments r WHERE r.workspace_id=l.workspace_id AND r.reverses_id=p.id) AS has_reversal,
        EXISTS(SELECT 1 FROM public.loan_corrections c WHERE c.workspace_id=l.workspace_id AND c.loan_id=l.id) AS has_correction,
        EXISTS(SELECT 1 FROM public.loan_voids v WHERE v.workspace_id=l.workspace_id AND v.loan_id=l.id) AS has_void
 FROM targets t JOIN public.loans l ON l.id=t.loan_id
 JOIN public.payments p ON p.workspace_id=l.workspace_id AND p.id=t.receipt_id AND p.loan_id=t.loan_id
)
SELECT workspace_id,loan_id,receipt_id,
       (all_principal_cents-loan_principal_cents)/100.0 AS principal_overallocated_php,
       (loan_interest_cents-all_interest_cents)/100.0 AS interest_underallocated_php,
       receipt_principal_cents/100.0 AS current_receipt_principal_php,
       receipt_interest_cents/100.0 AS current_receipt_interest_php,
       CASE WHEN loan_source='Imported workbook' AND receipt_source='Imported workbook'
                  AND all_principal_cents-loan_principal_cents=100
                  AND loan_interest_cents-all_interest_cents=100
                  AND all_receipts_cents=payable_cents
                  AND receipt_principal_cents>=100
                  AND NOT(has_reversal OR has_correction OR has_void)
            THEN 'READY FOR OWNER REVIEW' ELSE 'STOP — REVIEW SOURCE' END AS status
FROM matched ORDER BY workspace_id,loan_id;
-- Expect exactly eight rows for ONE workspace, each with ₱1 overallocated
-- to principal, ₱1 underallocated to interest and status READY.
