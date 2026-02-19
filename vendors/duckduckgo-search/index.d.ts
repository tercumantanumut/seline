interface SearchResult {
    title: string;
    href: string;
    body: string;
}
type Region = "wt-wt" | "us-en" | "uk-en" | "ru-ru" | string;
type SafeSearch = "on" | "moderate" | "off";
type TimeLimit = "d" | "w" | "m" | "y" | null;
type Backend = "auto" | "html" | "lite";

declare class DDGS {
    private readonly client;
    private sleepTimestamp;
    private static readonly IMPERSONATES;
    constructor(options?: {
        headers?: Record<string, string>;
        proxy?: string;
        timeout?: number;
        verify?: boolean;
    });
    private getRandomUserAgent;
    private sleep;
    private getUrl;
    text(options: {
        keywords: string;
        region?: Region;
        safesearch?: SafeSearch;
        timelimit?: TimeLimit;
        backend?: Backend;
        maxResults?: number;
    }): Promise<SearchResult[]>;
    private textHtml;
    private textLite;
}

export { DDGS };
