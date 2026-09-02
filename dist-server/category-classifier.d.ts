export type EmailCategory = 'receipts' | 'shipping' | 'promotions' | 'newsletters' | 'statements' | 'surveys' | 'account' | 'personal';
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
export declare function classifyMessage(input: CategorySignals): CategoryResult;
export declare const CATEGORY_DESCRIPTORS: Record<EmailCategory, {
    label: string;
    description: string;
    defaultProtected: boolean;
}>;
export declare function getCategoryDescriptors(): {
    label: string;
    description: string;
    defaultProtected: boolean;
    key: string;
}[];
