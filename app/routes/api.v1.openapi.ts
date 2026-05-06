import type { LoaderFunctionArgs } from 'react-router';

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Personal Finance API',
    version: '1.0.0',
    description: 'REST API for the personal finance tracker. All amounts are in cents (integer). Authenticate via `X-API-Key` header.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      Account: {
        type: 'object',
        properties: {
          id:             { type: 'integer' },
          name:           { type: 'string' },
          type:           { type: 'string', enum: ['debit', 'credit'] },
          accountType:    { type: 'string', enum: ['simple', 'deposit', 'security'] },
          category:       { type: 'string', example: 'asset/bank/revolut' },
          isActive:       { type: 'integer', enum: [0, 1] },
          currencyCode:   { type: 'string', example: 'USD' },
          securityTicker: { type: 'string', nullable: true },
        },
      },
      AccountDetail: {
        type: 'object',
        properties: {
          id:             { type: 'integer' },
          name:           { type: 'string' },
          type:           { type: 'string', enum: ['debit', 'credit'] },
          accountType:    { type: 'string', enum: ['simple', 'deposit', 'security'] },
          category:       { type: 'string' },
          isActive:       { type: 'integer', enum: [0, 1] },
          currencyId:     { type: 'integer' },
          currencyCode:   { type: 'string' },
          securityId:     { type: 'integer', nullable: true },
          securityTicker: { type: 'string', nullable: true },
        },
      },
      AccountInput: {
        type: 'object',
        required: ['name', 'type', 'accountType', 'currencyId', 'category'],
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 100 },
          type:        { type: 'string', enum: ['debit', 'credit'] },
          accountType: { type: 'string', enum: ['simple', 'deposit', 'security'] },
          currencyId:  { type: 'integer', minimum: 1 },
          category:    { type: 'string', example: 'asset/bank/revolut' },
          isActive:    { type: 'integer', enum: [0, 1], default: 1 },
          securityId:  { type: 'integer', nullable: true },
        },
      },
      Currency: {
        type: 'object',
        properties: {
          id:            { type: 'integer' },
          code:          { type: 'string', example: 'USD' },
          name:          { type: 'string', example: 'US Dollar' },
          symbol:        { type: 'string', example: '$' },
          decimalPlaces: { type: 'integer', minimum: 0, maximum: 8 },
          isBase:        { type: 'integer', enum: [0, 1] },
        },
      },
      CurrencyInput: {
        type: 'object',
        required: ['code', 'name', 'symbol', 'decimalPlaces'],
        properties: {
          code:          { type: 'string', minLength: 2, maxLength: 10, example: 'USD' },
          name:          { type: 'string', minLength: 1, maxLength: 100 },
          symbol:        { type: 'string', minLength: 1, maxLength: 10, example: '$' },
          decimalPlaces: { type: 'integer', minimum: 0, maximum: 8 },
          isBase:        { type: 'boolean', description: 'Set to true to make this the base currency' },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id:   { type: 'integer' },
          name: { type: 'string' },
        },
      },
      TagInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
      EntryInput: {
        type: 'object',
        required: ['accountId', 'side', 'amountStr', 'rateStr'],
        properties: {
          accountId:       { type: 'integer', minimum: 1 },
          side:            { type: 'string', enum: ['debit', 'credit'] },
          amountStr:       { type: 'string', example: '100.00', description: 'Amount in account currency as a decimal string' },
          rateStr:         { type: 'string', example: '1.2345', description: 'Exchange rate to base currency as a decimal string' },
          memo:            { type: 'string', maxLength: 500 },
          quantityStr:     { type: 'string', nullable: true, description: 'Security quantity (for security accounts)' },
          interestRatePct: { type: 'string', nullable: true, description: 'Annual interest rate percent (for deposit accounts)' },
          maturityDate:    { type: 'string', nullable: true, example: '2025-12-31', description: 'Maturity date (for deposit accounts)' },
        },
      },
      TransactionInput: {
        type: 'object',
        required: ['date', 'entries'],
        properties: {
          date:        { type: 'string', example: '2025-01-15', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          description: { type: 'string', maxLength: 500, nullable: true },
          tagIds:      { type: 'array', items: { type: 'integer' }, default: [] },
          entries:     { type: 'array', items: { '$ref': '#/components/schemas/EntryInput' }, minItems: 2 },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          date:        { type: 'string' },
          description: { type: 'string', nullable: true },
          hash:        { type: 'string', nullable: true },
        },
      },
      TransactionDetail: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          date:        { type: 'string' },
          description: { type: 'string', nullable: true },
          tagIds:      { type: 'array', items: { type: 'integer' } },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:                    { type: 'integer' },
                transactionId:         { type: 'integer' },
                accountId:             { type: 'integer' },
                side:                  { type: 'string', enum: ['debit', 'credit'] },
                amount:                { type: 'integer', description: 'Amount in cents (account currency)' },
                amountBase:            { type: 'integer', description: 'Amount in cents (base currency)' },
                quantity:              { type: 'integer', nullable: true, description: 'Security quantity (scaled by quantityScale)' },
                interestRate:          { type: 'integer', nullable: true, description: 'Interest rate in basis points' },
                maturityDate:          { type: 'string', nullable: true },
                memo:                  { type: 'string', nullable: true },
                currencyCode:          { type: 'string' },
                currencyDecimalPlaces: { type: 'integer' },
                isBaseCurrency:        { type: 'integer', enum: [0, 1] },
              },
            },
          },
        },
      },
      TransactionPage: {
        type: 'object',
        properties: {
          rows:        { type: 'array', items: { '$ref': '#/components/schemas/TransactionListRow' } },
          total:       { type: 'integer' },
          page:        { type: 'integer' },
          pageSize:    { type: 'integer' },
          pageCount:   { type: 'integer' },
          filterTags:  { type: 'array', items: { '$ref': '#/components/schemas/Tag' } },
          baseCurrency: {
            type: 'object',
            nullable: true,
            properties: {
              code:          { type: 'string' },
              symbol:        { type: 'string' },
              decimalPlaces: { type: 'integer' },
            },
          },
        },
      },
      TransactionListRow: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          date:        { type: 'string' },
          description: { type: 'string', nullable: true },
          entryCount:  { type: 'integer' },
          debitBase:   { type: 'integer', description: 'Total debit amount in base currency cents' },
          tags:        { type: 'array', items: { type: 'string' } },
        },
      },
      ReportSection: {
        type: 'object',
        properties: {
          accounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:          { type: 'integer' },
                name:        { type: 'string' },
                category:    { type: 'string' },
                balanceBase: { type: 'integer', description: 'Balance in base currency cents' },
              },
            },
          },
          total: { type: 'integer', description: 'Section total in base currency cents' },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Account' } } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create account',
        operationId: 'createAccount',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/AccountInput' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/AccountDetail' } } } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Conflict (duplicate category)', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          '422': { description: 'Validation error' },
        },
      },
    },
    '/accounts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        summary: 'Get account',
        operationId: 'getAccount',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/AccountDetail' } } } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update account',
        operationId: 'updateAccount',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/AccountInput' } } } },
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
          '422': { description: 'Validation error' },
        },
      },
      delete: {
        summary: 'Delete account',
        operationId: 'deleteAccount',
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Has transaction entries, cannot delete' },
        },
      },
    },
    '/transactions': {
      get: {
        summary: 'List transactions (paginated)',
        operationId: 'listTransactions',
        parameters: [
          { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'q',        in: 'query', schema: { type: 'string' }, description: 'Filter by description' },
          { name: 'dateFrom', in: 'query', schema: { type: 'string' }, description: 'Start date YYYY-MM-DD' },
          { name: 'dateTo',   in: 'query', schema: { type: 'string' }, description: 'End date YYYY-MM-DD' },
          { name: 'tagId',    in: 'query', schema: { type: 'integer' }, description: 'Filter by tag id' },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/TransactionPage' } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create transaction',
        operationId: 'createTransaction',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/TransactionInput' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/Transaction' } } } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Conflict' },
          '422': { description: 'Validation error (e.g. entries do not balance)' },
        },
      },
    },
    '/transactions/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        summary: 'Get transaction with entries',
        operationId: 'getTransaction',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/TransactionDetail' } } } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update transaction',
        operationId: 'updateTransaction',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/TransactionInput' } } } },
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
          '422': { description: 'Validation error' },
        },
      },
      delete: {
        summary: 'Delete transaction',
        operationId: 'deleteTransaction',
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/currencies': {
      get: {
        summary: 'List currencies',
        operationId: 'listCurrencies',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Currency' } } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create currency',
        operationId: 'createCurrency',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/CurrencyInput' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/Currency' } } } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Duplicate code' },
          '422': { description: 'Validation error' },
        },
      },
    },
    '/currencies/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        summary: 'Get currency',
        operationId: 'getCurrency',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/Currency' } } } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update currency (pass isBase:true to set as base)',
        operationId: 'updateCurrency',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/CurrencyInput' } } } },
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Conflict' },
          '422': { description: 'Validation error' },
        },
      },
      delete: {
        summary: 'Delete currency',
        operationId: 'deleteCurrency',
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Cannot delete base or used currency' },
        },
      },
    },
    '/tags': {
      get: {
        summary: 'List tags',
        operationId: 'listTags',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { '$ref': '#/components/schemas/Tag' } } } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create tag',
        operationId: 'createTag',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/TagInput' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/Tag' } } } } } },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Duplicate name' },
          '422': { description: 'Validation error' },
        },
      },
    },
    '/tags/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        summary: 'Get tag',
        operationId: 'getTag',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { '$ref': '#/components/schemas/Tag' } } } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update tag',
        operationId: 'updateTag',
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/TagInput' } } } },
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Duplicate name' },
          '422': { description: 'Validation error' },
        },
      },
      delete: {
        summary: 'Delete tag',
        operationId: 'deleteTag',
        responses: {
          '200': { description: 'Deleted' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Tag is used by transactions' },
        },
      },
    },
    '/reports/balance-sheet': {
      get: {
        summary: 'Balance sheet',
        operationId: 'getBalanceSheet',
        parameters: [
          { name: 'month', in: 'query', schema: { type: 'string', example: '2025-01' }, description: 'YYYY-MM (defaults to current month)' },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        asOfDate:    { type: 'string' },
                        isSnapshot:  { type: 'boolean' },
                        assets:      { '$ref': '#/components/schemas/ReportSection' },
                        liabilities: { '$ref': '#/components/schemas/ReportSection' },
                        equity:      { '$ref': '#/components/schemas/ReportSection' },
                        netWorth:    { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid month format' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/reports/income': {
      get: {
        summary: 'Income statement',
        operationId: 'getIncomeStatement',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', example: '2025-01-01' }, description: 'Start date YYYY-MM-DD' },
          { name: 'to',   in: 'query', schema: { type: 'string', example: '2025-12-31' }, description: 'End date YYYY-MM-DD' },
        ],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Invalid date format' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/reports/net-worth': {
      get: {
        summary: 'Net worth history (from snapshots)',
        operationId: 'getNetWorthHistory',
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/reports/spending': {
      get: {
        summary: 'Spending tree (hierarchical expense breakdown)',
        operationId: 'getSpending',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Start date YYYY-MM-DD' },
          { name: 'to',   in: 'query', schema: { type: 'string' }, description: 'End date YYYY-MM-DD' },
        ],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Invalid date format' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/reports/securities': {
      get: {
        summary: 'Securities performance history (from snapshots)',
        operationId: 'getSecurities',
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  },
};

export async function loader() {
  return Response.json(spec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
