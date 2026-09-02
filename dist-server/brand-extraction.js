import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dbPath = resolve(import.meta.dirname ?? '', 'brand-db.json');
const db = JSON.parse(readFileSync(dbPath, 'utf8'));
const BRAND_BY_DOMAIN = new Map();
for (const b of db.brands) {
    for (const d of b.domains) {
        BRAND_BY_DOMAIN.set(d.toLowerCase(), b);
    }
}
const ALIASES = new Set([
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
    'newsletter',
    'news',
    'marketing',
    'promotions',
    'deals',
    'notifications',
    'notification',
    'alerts',
    'alert',
    'info',
    'support',
    'hello',
    'team',
    'mail',
    'email',
    'postmaster',
    'bounce',
    'bounces',
    'returns',
    'receipts',
    'receipt',
    'orders',
    'order',
    'shipping',
    'shipment',
    'tracker',
    'tracking',
    'billing',
    'statements',
    'survey',
    'surveys',
    'feedback',
    'store',
    'shop',
    'community',
    'noreply-mailer',
]);
function stripTag(local) {
    const plus = local.indexOf('+');
    if (plus >= 0)
        return local.slice(0, plus);
    return local;
}
export function extractRootDomain(address) {
    const at = address.lastIndexOf('@');
    if (at < 0)
        return '';
    const domain = address.slice(at + 1).trim().toLowerCase();
    const parts = domain.split('.').filter(Boolean);
    if (parts.length <= 2)
        return domain;
    const lastTwo = parts.slice(-2).join('.');
    const knownMultiPart = new Set([
        'co.uk',
        'co.jp',
        'co.in',
        'co.au',
        'co.nz',
        'co.kr',
        'co.za',
        'co.id',
        'co.th',
        'com.au',
        'com.br',
        'com.mx',
        'com.tr',
        'com.cn',
        'com.hk',
        'com.tw',
        'com.sg',
        'ne.jp',
        'or.jp',
        'ac.uk',
        'gov.uk',
        'org.uk',
        'ab.ca',
        'qc.ca',
        'com.ar',
        'com.pl',
        'com.tr',
    ]);
    const lastThree = parts.slice(-3).join('.');
    if (parts.length >= 3 && knownMultiPart.has(lastTwo)) {
        return lastThree;
    }
    return lastTwo;
}
function lookupBrand(rootDomain) {
    if (BRAND_BY_DOMAIN.has(rootDomain)) {
        return BRAND_BY_DOMAIN.get(rootDomain);
    }
    for (const [key, brand] of BRAND_BY_DOMAIN.entries()) {
        if (rootDomain.endsWith(`.${key}`)) {
            return brand;
        }
    }
    return undefined;
}
function prettifyRootDomain(rootDomain) {
    const sld = rootDomain.split('.')[0] ?? rootDomain;
    if (!sld)
        return rootDomain;
    return sld.charAt(0).toUpperCase() + sld.slice(1);
}
export function normalizeSender(raw) {
    const trimmed = (raw ?? '').trim().toLowerCase();
    const at = trimmed.lastIndexOf('@');
    if (at < 0)
        return trimmed;
    const local = stripTag(trimmed.slice(0, at));
    const domain = trimmed.slice(at + 1);
    const aliasPart = local.split(/[._-]/)[0];
    const cleanedAlias = ALIASES.has(aliasPart) ? 'noreply' : local;
    return `${cleanedAlias}@${domain}`;
}
export function extractBrandKey(rawSender) {
    const normalizedSender = normalizeSender(rawSender);
    const rootDomain = extractRootDomain(normalizedSender);
    const brand = lookupBrand(rootDomain);
    if (brand) {
        return {
            brandKey: brand.key,
            displayName: brand.displayName,
            rootDomain,
            normalizedSender,
            isCustom: false,
        };
    }
    const fallbackKey = rootDomain || normalizedSender || 'unknown';
    return {
        brandKey: fallbackKey,
        displayName: prettifyRootDomain(rootDomain) || 'Unknown',
        rootDomain,
        normalizedSender,
        isCustom: true,
    };
}
