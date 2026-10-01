/*
 * Recreates receivable entries that were skipped by the sales-attendance
 * regression. It is intentionally scoped, transactional and idempotent.
 *
 * Usage:
 *   DATABASE_URL='...' node scripts/reconcile-missing-sales-receivables.js --apply
 */
const { Client } = require('pg');

const START_DATE = '2026-09-14';
const PAYMENT_METHOD = 'Boleto';
const BRADESCO_ACCOUNT_ID = '72cab233-05e4-4b1f-b720-3e70a3404079';
const apply = process.argv.includes('--apply');

const candidatesSql = `
  SELECT
    sa.id AS attendance_id,
    so.id AS sales_order_id,
    so.order_number,
    so.due_date,
    sa.total_value AS amount,
    c.name AS client_name
  FROM public.sale_attendances sa
  JOIN public.sales_orders so ON so.id = sa.sales_order_id
  JOIN public.clients c ON c.id = so.client_id
  WHERE sa.status = 'Concluído'
    AND sa.fulfilled_at >= $1::date
    AND sa.total_value > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.financial_entries fe
      WHERE fe.entry_type = 'Receber'
        AND fe.category = 'Vendas'
        AND fe.attendance_id = sa.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.financial_entries fe
      WHERE fe.entry_type = 'Receber'
        AND fe.category = 'Vendas'
        AND (
          (fe.reference_table = 'sales_orders' AND fe.reference_id = so.id)
          OR (
            fe.reference_table = 'sales_order_financial_finalizations'
            AND EXISTS (
              SELECT 1
              FROM public.sales_order_financial_finalizations sf
              WHERE sf.id = fe.reference_id
                AND sf.sales_order_id = so.id
            )
          )
        )
    )
  ORDER BY sa.fulfilled_at, so.order_number
`;

const insertSql = `
  WITH candidates AS (
    ${candidatesSql}
  ), inserted AS (
    INSERT INTO public.financial_entries (
      entry_type, description, amount, due_date, status, category, client_id,
      reference_table, reference_id, attendance_id, payment_method, installments,
      installment_group_id, installment_number, bank_account_id
    )
    SELECT
      'Receber',
      'Venda ' || so.order_number || ' (Fatura - Atendimento ' || sa.attendance_number || ')',
      sa.total_value,
      so.due_date,
      'Aberto',
      'Vendas',
      so.client_id,
      'sales_orders',
      so.id,
      sa.id,
      $2,
      1,
      gen_random_uuid(),
      1,
      $3::uuid
    FROM candidates candidate
    JOIN public.sale_attendances sa ON sa.id = candidate.attendance_id
    JOIN public.sales_orders so ON so.id = candidate.sales_order_id
    RETURNING id, attendance_id, amount
  ), allocation_base AS (
    SELECT
      inserted.id AS financial_entry_id,
      inserted.amount AS entry_amount,
      sa.total_value AS attendance_total,
      sai.id AS attendance_item_id,
      sai.total_value AS attendance_item_total,
      fp.cost_center_id,
      fp.accounting_category_id,
      fp.accounting_subcategory_id,
      fp.cost_type,
      ROW_NUMBER() OVER (PARTITION BY inserted.id ORDER BY sai.id) AS item_number,
      COUNT(*) OVER (PARTITION BY inserted.id) AS item_count
    FROM inserted
    JOIN public.sale_attendances sa ON sa.id = inserted.attendance_id
    JOIN public.sale_attendance_items sai ON sai.attendance_id = sa.id
    JOIN public.sales_order_items soi ON soi.id = sai.sales_order_item_id
    JOIN public.finished_products fp ON fp.id = soi.product_id
  ), allocations AS (
    SELECT
      *,
      COALESCE(
        SUM(ROUND(entry_amount * (attendance_item_total / attendance_total), 4))
          OVER (
            PARTITION BY financial_entry_id
            ORDER BY attendance_item_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
        0
      ) AS previous_amount
    FROM allocation_base
  ), rateios AS (
    INSERT INTO public.financial_entry_items (
      financial_entry_id, amount, cost_center_id, accounting_category_id,
      accounting_subcategory_id, cost_type
    )
    SELECT
      financial_entry_id,
      CASE
        WHEN item_number = item_count THEN entry_amount - previous_amount
        ELSE ROUND(entry_amount * (attendance_item_total / attendance_total), 4)
      END,
      cost_center_id,
      accounting_category_id,
      accounting_subcategory_id,
      cost_type
    FROM allocations
    RETURNING financial_entry_id
  )
  SELECT
    (SELECT COUNT(*) FROM inserted)::int AS inserted_count,
    COALESCE((SELECT SUM(amount) FROM inserted), 0)::numeric AS inserted_total,
    (SELECT COUNT(*) FROM rateios)::int AS rateio_count
`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL.');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    const account = await client.query(
      'SELECT id, name FROM public.bank_accounts WHERE id = $1 AND active = true FOR SHARE',
      [BRADESCO_ACCOUNT_ID],
    );
    if (account.rowCount !== 1) throw new Error('A conta BRADESCO SA não está ativa ou não foi encontrada.');

    const preview = await client.query(candidatesSql, [START_DATE]);
    const previewTotal = preview.rows.reduce((sum, row) => sum + Number(row.amount), 0);
    console.table(preview.rows.map(({ attendance_id, sales_order_id, ...row }) => row));
    console.log(`Candidatos: ${preview.rowCount}; total: R$ ${previewTotal.toFixed(2)}.`);

    if (!apply) {
      await client.query('ROLLBACK');
      console.log('Prévia concluída. Nenhum dado foi alterado.');
      return;
    }

    const result = await client.query(insertSql, [START_DATE, PAYMENT_METHOD, BRADESCO_ACCOUNT_ID]);
    const summary = result.rows[0];
    if (Number(summary.inserted_count) !== preview.rowCount || Number(summary.inserted_total) !== previewTotal) {
      throw new Error('A prévia mudou durante a execução; a transação foi cancelada. Execute novamente.');
    }
    await client.query('COMMIT');
    console.log(`Concluído: ${summary.inserted_count} títulos, R$ ${Number(summary.inserted_total).toFixed(2)}, ${summary.rateio_count} rateios.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
