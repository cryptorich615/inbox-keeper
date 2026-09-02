export type EmailCategory =
  | 'receipts'
  | 'shipping'
  | 'promotions'
  | 'newsletters'
  | 'statements'
  | 'surveys'
  | 'account'
  | 'personal';

export interface CategorySignals {
  subject: string;
  snippet: string;
  fromAddress: string;
  hasListUnsubscribe: boolean;
  hasAttachments: boolean;
}

export interface CategoryResult {
  category: EmailCategory;
  confidence: number;
  signals: string[];
}

const RX_RECEIPT =
  /\b(receipt|order\s*#?\d+|invoice|your\s+(order|purchase)|payment\s+(received|confirmed)|thank\s*you\s*for\s*your\s+(order|purchase)|grand\s+total|subtotal|amount\s+due|usd\s*\$?|\$\d+(?:\.\d{2})?)\b/i;
const RX_SHIPPING =
  /\b(tracking\s*#?\s*number|shipped|out\s+for\s+delivery|in\s+transit|delivery\s+update|arriving|carrier|\bups\b|\busps\b|\bfedex\b|\bdhl\b|estimated\s+delivery|delivery\s+attempt)\b/i;
const RX_STATEMENT =
  /\b(statement|billing\s+statement|account\s+summary|your\s+bill|minimum\s+payment|past\s+due|balance\s+due|autopay|auto-?pay)\b/i;
const RX_SURVEY =
  /\b(tell\s+us\s+how\s+we\s+did|rate\s+your\s+experience|customer\s+satisfaction|leave\s+a\s+review|how\s+did\s+we\s+do|share\s+your\s+feedback|we'?d\s+love\s+to\s+hear)\b/i;
const RX_ACCOUNT =
  /\b(security\s+alert|sign-?in\s+(attempt|alert)|login\s+alert|verification\s+code|one-?time\s+(code|passcode)|password\s+(reset|changed)|new\s+device|2fa|two-?factor|authenticate|verify\s+your\s+(identity|email))\b/i;
const RX_PROMO =
  /\b(sale|off|deal|limited\s+time|shop\s+now|buy\s+now|don'?t\s+miss|%\s*off|coupon|free\s+shipping|exclusive\s+offer|members\s+only|flash\s+sale|clearance)\b/i;
const RX_ORDER_NUMBER = /\b(?:order|confirmation|invoice|ticket|reference)\s*[#:]\s*[a-z0-9-]{4,}/i;
const RX_TRACKING_NUMBER = /\b1z[0-9a-z]{16}\b|\b9\d{3}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b|\bTBA\d{10,}\b/i;

export function classifyMessage(input: CategorySignals): CategoryResult {
  const subject = input.subject ?? '';
  const snippet = input.snippet ?? '';
  const blob = `${subject}\n${snippet}`;
  const signals: string[] = [];

  if (RX_ACCOUNT.test(blob)) signals.push('account-pattern');
  if (RX_SURVEY.test(blob)) signals.push('survey-pattern');
  if (RX_STATEMENT.test(blob)) signals.push('statement-pattern');
  if (RX_RECEIPT.test(blob) || RX_ORDER_NUMBER.test(blob)) signals.push('receipt-pattern');
  if (RX_SHIPPING.test(blob) || RX_TRACKING_NUMBER.test(blob)) signals.push('shipping-pattern');
  if (input.hasListUnsubscribe) signals.push('has-list-unsubscribe');
  if (RX_PROMO.test(blob)) signals.push('promo-language');
  if (subject.length >= 40 && input.hasListUnsubscribe) signals.push('long-subject-newsletter');

  const scores: Record<EmailCategory, number> = {
    account: 0,
    surveys: 0,
    statements: 0,
    receipts: 0,
    shipping: 0,
    promotions: 0,
    newsletters: 0,
    personal: 0,
  };

  if (signals.includes('account-pattern')) scores.account += 3;
  if (signals.includes('survey-pattern')) scores.surveys += 3;
  if (signals.includes('statement-pattern')) scores.statements += 3;

  const hasTransactional =
    signals.includes('receipt-pattern') || signals.includes('shipping-pattern');

  if (signals.includes('receipt-pattern')) scores.receipts += 3;
  if (signals.includes('shipping-pattern')) scores.shipping += 3;

  if (
    input.hasListUnsubscribe &&
    !hasTransactional &&
    signals.includes('promo-language')
  ) {
    scores.promotions += 3;
  }

  if (
    input.hasListUnsubscribe &&
    !hasTransactional &&
    signals.includes('long-subject-newsletter') &&
    !signals.includes('promo-language')
  ) {
    scores.newsletters += 3;
  }

  if (
    input.hasListUnsubscribe &&
    !hasTransactional &&
    !signals.includes('promo-language') &&
    !signals.includes('long-subject-newsletter')
  ) {
    scores.promotions += 1;
    scores.newsletters += 1;
  }

  let best: EmailCategory = 'personal';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores) as Array<[EmailCategory, number]>) {
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  if (bestScore === 0) {
    best = 'personal';
    signals.push('no-pattern-match');
  }

  const confidence = bestScore >= 3 ? 0.9 : bestScore >= 2 ? 0.7 : 0.5;

  return { category: best, confidence, signals };
}

export const CATEGORY_DESCRIPTORS: Record<EmailCategory, { label: string; description: string; defaultProtected: boolean }> = {
  receipts: {
    label: 'Receipts / Orders',
    description: 'Order confirmations, invoices, payment receipts, dollar amounts.',
    defaultProtected: false,
  },
  shipping: {
    label: 'Shipping / Tracking',
    description: 'Tracking updates, carrier notifications, delivery alerts.',
    defaultProtected: false,
  },
  promotions: {
    label: 'Promotions / Marketing',
    description: 'Marketing email with unsubscribe header and promotional language.',
    defaultProtected: false,
  },
  newsletters: {
    label: 'Newsletters',
    description: 'Long-form recurring email with unsubscribe header.',
    defaultProtected: false,
  },
  statements: {
    label: 'Statements / Bills',
    description: 'Billing statements, account summaries, past-due notices.',
    defaultProtected: false,
  },
  surveys: {
    label: 'Surveys / Reviews',
    description: 'Post-purchase surveys, experience ratings, review requests.',
    defaultProtected: false,
  },
  account: {
    label: 'Account / Security',
    description: 'Sign-in alerts, password resets, verification codes.',
    defaultProtected: true,
  },
  personal: {
    label: 'Personal',
    description: 'Email that does not match a recognized pattern.',
    defaultProtected: false,
  },
};

export function getCategoryDescriptors() {
  return Object.entries(CATEGORY_DESCRIPTORS).map(([key, value]) => ({
    key,
    ...value,
  }));
}
