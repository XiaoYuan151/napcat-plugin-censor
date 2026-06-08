import fs from 'node:fs';
import path from 'node:path';
import { getDefaultConfig } from '../config';
import type { NapCatActions, NapCatPluginContext, PluginLogger } from '../napcat';
import type { GroupConfig, PluginConfig, PluginStats } from '../types';
import { splitCommaList } from '../utils/list';

const LOG_TAG = '[napcat-plugin-censor]';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
    const value = source[key];
    return typeof value === 'boolean' ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function readNumberWithLegacy(source: Record<string, unknown>, key: string, legacyKey: string): number | undefined {
    return readNumber(source, key) ?? readNumber(source, legacyKey);
}

function readBooleanWithLegacy(source: Record<string, unknown>, key: string, legacyKey: string): boolean | undefined {
    return readBoolean(source, key) ?? readBoolean(source, legacyKey);
}

function clampInteger(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function sanitizeGroupConfigs(raw: unknown): Record<string, GroupConfig> {
    if (!isRecord(raw)) return {};

    const out: Record<string, GroupConfig> = {};
    for (const [groupId, value] of Object.entries(raw)) {
        if (!isRecord(value)) continue;
        const enabled = readBoolean(value, 'enabled');
        out[groupId] = enabled === undefined ? {} : { enabled };
    }
    return out;
}

export function sanitizeConfig(raw: unknown): PluginConfig {
    const defaults = getDefaultConfig();
    if (!isRecord(raw)) return defaults;

    const config: PluginConfig = { ...defaults };

    config.enabled = readBoolean(raw, 'enabled') ?? config.enabled;
    config.debug = readBoolean(raw, 'debug') ?? config.debug;
    config.adminIds = readString(raw, 'adminIds') ?? config.adminIds;
    config.censorGroups = readString(raw, 'censorGroups') ?? config.censorGroups;
    config.censorWords = readString(raw, 'censorWords') ?? config.censorWords;
    config.dictionaryUrl = readString(raw, 'dictionaryUrl') ?? config.dictionaryUrl;
    config.guardApiUrl = readString(raw, 'guardApiUrl') ?? config.guardApiUrl;
    config.showFilterNotice = readBooleanWithLegacy(raw, 'showFilterNotice', 'filterMsg') ?? config.showFilterNotice;

    const maxViolations = readNumberWithLegacy(raw, 'maxViolations', 'maxAgainst');
    if (maxViolations !== undefined) config.maxViolations = clampInteger(maxViolations, 0, 1000);

    const banDurationSeconds = readNumberWithLegacy(raw, 'banDurationSeconds', 'banDuration');
    if (banDurationSeconds !== undefined) config.banDurationSeconds = clampInteger(banDurationSeconds, 0, 2592000);

    const reportBatchSize = readNumberWithLegacy(raw, 'reportBatchSize', 'sendTime');
    if (reportBatchSize !== undefined) config.reportBatchSize = clampInteger(reportBatchSize, 1, 1000);

    const guardTimeoutMs = readNumber(raw, 'guardTimeoutMs');
    if (guardTimeoutMs !== undefined) config.guardTimeoutMs = clampInteger(guardTimeoutMs, 1000, 120000);

    config.groupConfigs = sanitizeGroupConfigs(raw.groupConfigs);

    return config;
}

function createStats(): PluginStats {
    return {
        processed: 0,
        todayProcessed: 0,
        blocked: 0,
        reported: 0,
        banned: 0,
        lastUpdateDay: new Date().toDateString(),
    };
}

function sanitizeStats(raw: unknown, fallback: PluginStats): PluginStats {
    if (!isRecord(raw)) return { ...fallback };

    return {
        processed: clampInteger(readNumber(raw, 'processed') ?? fallback.processed, 0, Number.MAX_SAFE_INTEGER),
        todayProcessed: clampInteger(readNumber(raw, 'todayProcessed') ?? fallback.todayProcessed, 0, Number.MAX_SAFE_INTEGER),
        blocked: clampInteger(readNumber(raw, 'blocked') ?? fallback.blocked, 0, Number.MAX_SAFE_INTEGER),
        reported: clampInteger(readNumber(raw, 'reported') ?? fallback.reported, 0, Number.MAX_SAFE_INTEGER),
        banned: clampInteger(readNumber(raw, 'banned') ?? fallback.banned, 0, Number.MAX_SAFE_INTEGER),
        lastUpdateDay: readString(raw, 'lastUpdateDay') ?? fallback.lastUpdateDay,
    };
}

class PluginState {
    logger: PluginLogger | null = null;
    actions: NapCatActions | undefined;
    adapterName = '';
    networkConfig: unknown = null;
    config: PluginConfig = getDefaultConfig();
    configPath = '';
    dataPath = '';
    pluginName = '';
    startTime = 0;
    initialized = false;
    stats: PluginStats = createStats();

    log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
        this.logger?.[level](`${LOG_TAG} ${message}`, ...args);
    }

    logDebug(message: string, ...args: unknown[]): void {
        if (!this.config.debug) return;
        this.logger?.info(`${LOG_TAG} [debug] ${message}`, ...args);
    }

    async callApi(api: string, params: Record<string, unknown>): Promise<unknown> {
        if (!this.actions || !this.networkConfig) {
            throw new Error(`NapCat actions are not initialized for ${api}`);
        }

        return this.actions.call(api, params, this.adapterName, this.networkConfig);
    }

    initFromContext(ctx: NapCatPluginContext): void {
        this.logger = ctx.logger;
        this.actions = ctx.actions;
        this.adapterName = ctx.adapterName || '';
        this.networkConfig = ctx.pluginManager?.config || null;
        this.configPath = ctx.configPath || '';
        this.pluginName = ctx.pluginName || '';
        this.dataPath = ctx.configPath ? path.dirname(ctx.configPath) : path.join(process.cwd(), 'data', 'napcat-plugin-censor');
        this.startTime = Date.now();
    }

    getUptime(): number {
        return Math.max(0, Date.now() - this.startTime);
    }

    getUptimeFormatted(): string {
        const seconds = Math.floor(this.getUptime() / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    loadConfig(ctx?: NapCatPluginContext): void {
        const configPath = ctx?.configPath || this.configPath;

        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
                this.config = sanitizeConfig(raw);
                this.stats = sanitizeStats(isRecord(raw) ? raw.stats : undefined, this.stats);
            } else {
                this.config = getDefaultConfig();
                this.saveConfig(ctx);
            }
            this.initialized = true;
        } catch (error) {
            this.config = getDefaultConfig();
            this.initialized = true;
            this.log('error', 'Failed to load config; defaults are active', error);
        }
    }

    saveConfig(ctx?: NapCatPluginContext, config?: PluginConfig): void {
        const configPath = ctx?.configPath || this.configPath;
        if (!configPath) {
            this.log('warn', 'Skipped config save because configPath is empty');
            return;
        }

        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(
                configPath,
                JSON.stringify({ ...(config || this.config), stats: this.stats }, null, 2),
                'utf-8'
            );
        } catch (error) {
            this.log('error', 'Failed to save config', error);
        }
    }

    getConfig(): PluginConfig {
        return {
            ...this.config,
            groupConfigs: { ...(this.config.groupConfigs || {}) },
        };
    }

    setConfig(ctx: NapCatPluginContext, update: Partial<PluginConfig>): void {
        this.config = sanitizeConfig({
            ...this.config,
            ...update,
            groupConfigs: update.groupConfigs ?? this.config.groupConfigs,
        });
        this.saveConfig(ctx);
    }

    replaceConfig(ctx: NapCatPluginContext, config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig(ctx);
    }

    updateGroupConfig(ctx: NapCatPluginContext, groupId: string, config: GroupConfig): void {
        const groupConfigs = { ...(this.config.groupConfigs || {}) };
        groupConfigs[groupId] = {
            ...groupConfigs[groupId],
            ...config,
        };
        this.setConfig(ctx, { groupConfigs });
    }

    isGroupEnabled(groupId: string | number): boolean {
        return this.shouldCensorGroup(groupId);
    }

    shouldCensorGroup(groupId: string | number): boolean {
        const id = String(groupId);
        const groupConfig = this.config.groupConfigs?.[id];
        if (groupConfig?.enabled !== undefined) return groupConfig.enabled;

        const configuredGroups = splitCommaList(this.config.censorGroups);
        if (configuredGroups.length === 0) return false;
        return configuredGroups.includes(id);
    }

    markProcessed(): void {
        this.rollDailyStatsIfNeeded();
        this.stats.processed += 1;
        this.stats.todayProcessed += 1;
    }

    markBlocked(): void {
        this.stats.blocked += 1;
    }

    markReported(): void {
        this.stats.reported += 1;
    }

    markBanned(): void {
        this.stats.banned += 1;
    }

    incrementProcessedCount(): void {
        this.markProcessed();
        this.saveConfig();
    }

    persistStats(ctx?: NapCatPluginContext): void {
        this.saveConfig(ctx);
    }

    private rollDailyStatsIfNeeded(): void {
        const today = new Date().toDateString();
        if (this.stats.lastUpdateDay === today) return;
        this.stats.todayProcessed = 0;
        this.stats.lastUpdateDay = today;
    }
}

export const pluginState = new PluginState();
