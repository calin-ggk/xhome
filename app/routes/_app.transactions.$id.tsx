import { redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getEditTransactionFormData, updateTransaction } from '~/services/transaction.service';
import { transactionFormSchema } from '~/schemas/transaction.schema';
import { TransactionForm } from '~/components/TransactionForm';
import type { Route } from './+types/_app.transactions.$id';

export async function loader({ params }: Route.LoaderArgs) {
  const id   = Number(params.id);
  const data = getEditTransactionFormData(db, id);
  if (!data) throw new Response('Not Found', { status: 404 });
  return data;
}

export async function action({ request, params }: Route.ActionArgs) {
  const id     = Number(params.id);
  const form   = await request.formData();
  const tagRaw = String(form.get('tagIds') ?? '');
  const tagIds = tagRaw.split(',').map(Number).filter(n => n > 0);

  let entries: unknown;
  try {
    entries = JSON.parse(String(form.get('entriesJson') ?? '[]'));
  } catch {
    return { error: 'transactions.invalidSubmission' };
  }

  const parsed = transactionFormSchema.safeParse({
    date:        form.get('date'),
    description: form.get('description') || null,
    tagIds,
    entries,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = updateTransaction(db, id, parsed.data);
  if (!result.ok) return { error: result.error };

  return redirect('/transactions');
}

export default function EditTransactionPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <TransactionForm
      accounts={loaderData.accounts}
      exchangeRates={loaderData.exchangeRates}
      tags={loaderData.tags}
      baseCurrency={loaderData.baseCurrency}
      initialValues={{
        date:        loaderData.transaction.date,
        description: loaderData.transaction.description,
        tagIds:      loaderData.transaction.tagIds,
        entries:     loaderData.transaction.entries,
      }}
      actionData={actionData}
      title={t('transactions.editTransaction')}
      backLink="/transactions"
      submitLabel={t('transactions.save')}
    />
  );
}
