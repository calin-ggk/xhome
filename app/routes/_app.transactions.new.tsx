import { redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getNewTransactionFormData, createTransaction } from '~/services/transaction.service';
import { transactionFormSchema } from '~/schemas/transaction.schema';
import { TransactionForm } from '~/components/TransactionForm';
import type { Route } from './+types/_app.transactions.new';

export async function loader(_: Route.LoaderArgs) {
  return getNewTransactionFormData(db);
}

export async function action({ request }: Route.ActionArgs) {
  const form    = await request.formData();
  const tagRaw  = String(form.get('tagIds') ?? '');
  const tagIds  = tagRaw.split(',').map(Number).filter(n => n > 0);

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

  const result = createTransaction(db, parsed.data);
  if (!result.ok) return { error: result.error };

  return redirect('/transactions');
}

export default function NewTransactionPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <TransactionForm
      {...loaderData}
      actionData={actionData}
      title={t('transactions.newTransaction')}
      backLink="/transactions"
      submitLabel={t('transactions.save')}
    />
  );
}
