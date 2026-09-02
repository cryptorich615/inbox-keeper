export interface ExtractedBrand {
    brandKey: string;
    displayName: string;
    rootDomain: string;
    normalizedSender: string;
    isCustom: boolean;
}
export declare function extractRootDomain(address: string): string;
export declare function normalizeSender(raw: string): string;
export declare function extractBrandKey(rawSender: string): ExtractedBrand;
