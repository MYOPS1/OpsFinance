BEGIN;

DO $$
DECLARE
  invalid_row_count integer;
BEGIN
  SELECT COUNT(*)
  INTO invalid_row_count
  FROM (
    SELECT fa.id
    FROM public.financial_accounts fa
    LEFT JOIN public.accounts a
      ON a.business_id = fa.business_id
     AND a.code = fa.account_code
    GROUP BY fa.id
    HAVING COUNT(a.id) <> 1
  ) invalid_rows;

  IF invalid_row_count > 0 THEN
    RAISE EXCEPTION 'Financial account reconciliation aborted: every existing financial_accounts row must have exactly one same-business COA match before backfill.';
  END IF;
END $$;

UPDATE public.financial_accounts fa
SET account_id = a.id
FROM public.accounts a
WHERE a.business_id = fa.business_id
  AND a.code = fa.account_code
  AND a.id IS NOT NULL
  AND fa.account_id IS DISTINCT FROM a.id;

DO $$
DECLARE
  unmapped_row_count integer;
BEGIN
  SELECT COUNT(*)
  INTO unmapped_row_count
  FROM public.financial_accounts fa
  WHERE fa.account_id IS NULL;

  IF unmapped_row_count > 0 THEN
    RAISE EXCEPTION 'Financial account reconciliation failed: one or more rows remain unmapped after backfill.';
  END IF;
END $$;

COMMIT;
