export interface PluginConfig {
    enabled: boolean;
    debug: boolean;
    adminIds: string;
    censorGroups: string;
    censorWords: string;
    maxViolations: number;
    banDurationSeconds: number;
    reportBatchSize: number;
    showFilterNotice: boolean;
    dictionaryUrl: string;
    guardApiUrl: string;
    guardTimeoutMs: number;
    groupConfigs?: Record<string, GroupConfig>;
}

export interface GroupConfig {
    enabled?: boolean;
}

export interface PluginStats {
    processed: number;
    todayProcessed: number;
    blocked: number;
    reported: number;
    banned: number;
    lastUpdateDay: string;
}

export interface ApiResponse<T = unknown> {
    code: number;
    message?: string;
    data?: T;
}

export interface TextSegment {
    type: 'text';
    data: { text: string };
}

export interface ImageSegment {
    type: 'image';
    data: { file: string };
}

export interface AtSegment {
    type: 'at';
    data: { qq: string };
}

export interface ReplySegment {
    type: 'reply';
    data: { id: string };
}

export type MessageSegment =
    | TextSegment
    | ImageSegment
    | AtSegment
    | ReplySegment
    | { type: string; data: Record<string, unknown> };

export interface ForwardNode {
    type: 'node';
    data: {
        user_id: string;
        nickname: string;
        content: MessageSegment[];
    };
}

export type CensorSource = 'custom' | 'dictionary' | 'guard';

export interface CensorDecision {
    unsafe: boolean;
    source?: CensorSource;
    matchedWord?: string;
    guardResponse?: string;
}
