export interface PluginConfigItem {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'multi-select' | 'html' | 'text';
    label: string;
    description?: string;
    default?: unknown;
    options?: Array<{ label: string; value: string | number }>;
    placeholder?: string;
    reactive?: boolean;
    hidden?: boolean;
}

export type PluginConfigSchema = PluginConfigItem[];

export interface NapCatConfigBuilder {
    text(key: string, label: string, defaultValue?: string, description?: string, reactive?: boolean): PluginConfigItem;
    number(key: string, label: string, defaultValue?: number, description?: string, reactive?: boolean): PluginConfigItem;
    boolean(key: string, label: string, defaultValue?: boolean, description?: string, reactive?: boolean): PluginConfigItem;
    html(content: string): PluginConfigItem;
    combine(...items: PluginConfigItem[]): PluginConfigSchema;
}

export interface PluginHttpRequest {
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string | string[] | undefined>;
    headers?: Record<string, string | string[] | undefined>;
}

export interface PluginHttpResponse {
    status(code: number): PluginHttpResponse;
    json(data: unknown): void;
    send(data: string | Buffer): void;
    setHeader(name: string, value: string): PluginHttpResponse;
}

export type PluginRequestHandler = (req: PluginHttpRequest, res: PluginHttpResponse) => void | Promise<void>;

export interface PluginPageDefinition {
    path: string;
    title: string;
    icon?: string;
    htmlFile: string;
    description?: string;
}

export interface PluginRouter {
    static(urlPath: string, localPath: string): void;
    get(path: string, handler: PluginRequestHandler): void;
    getNoAuth(path: string, handler: PluginRequestHandler): void;
    postNoAuth(path: string, handler: PluginRequestHandler): void;
    page?(page: PluginPageDefinition): void;
}

export interface PluginLogger {
    log(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export interface NapCatActions {
    call(action: string, params: Record<string, unknown>, adapterName?: string, config?: unknown): Promise<unknown>;
}

export interface NapCatPluginContext {
    logger: PluginLogger;
    actions: NapCatActions;
    adapterName: string;
    pluginName: string;
    configPath: string;
    pluginManager: {
        config: unknown;
    };
    router: PluginRouter;
    NapCatConfig: NapCatConfigBuilder;
}

export interface PluginConfigUIController {
    updateSchema: (schema: PluginConfigSchema) => void;
    updateField: (key: string, field: Partial<PluginConfigItem>) => void;
    removeField: (key: string) => void;
    addField: (field: PluginConfigItem, afterKey?: string) => void;
    showField: (key: string) => void;
    hideField: (key: string) => void;
    getCurrentConfig: () => Record<string, unknown>;
}

export interface OB11Message {
    post_type?: string;
    message_type?: string;
    group_id?: number | string;
    user_id?: number | string;
    message_id?: number | string;
    raw_message?: string;
}

export interface OB11Group {
    group_id: number;
    group_name: string;
    member_count: number;
    max_member_count: number;
}
