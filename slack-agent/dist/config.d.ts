export declare const config: {
    slack: {
        botToken: string;
        signingSecret: string;
        appToken: string;
        channelId: string;
    };
    copilot: {
        apiKey: string;
        model: string;
    };
    git: {
        provider: "gitlab" | "github";
        gitlab: {
            url: string;
            token: string;
            projectId: string;
        };
        github: {
            token: string;
            repo: string;
        };
    };
    docStorage: string;
};
export declare function validateConfig(): string[];
//# sourceMappingURL=config.d.ts.map