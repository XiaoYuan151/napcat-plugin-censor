import type {
    NapCatPluginContext,
    OB11Group,
    PluginHttpRequest,
    PluginHttpResponse,
} from '../napcat';
import { pluginState } from '../core/state';
import { censorService } from './censor-service';
import type { PluginConfig } from '../types';

function parseBody(req: PluginHttpRequest): Record<string, unknown> {
    if (req.body && typeof req.body === 'object') {
        return req.body as Record<string, unknown>;
    }
    return {};
}

function sendError(res: PluginHttpResponse, status: number, error: unknown): void {
    res.status(status).json({
        code: -1,
        message: error instanceof Error ? error.message : String(error),
    });
}

export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    router.getNoAuth('/info', (_req: PluginHttpRequest, res: PluginHttpResponse) => {
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                dictionarySize: censorService.dictionarySize,
            },
        });
    });

    router.getNoAuth('/status', (_req: PluginHttpRequest, res: PluginHttpResponse) => {
        res.json({
            code: 0,
            data: {
                pluginName: pluginState.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.getConfig(),
                stats: pluginState.stats,
                dictionarySize: censorService.dictionarySize,
            },
        });
    });

    router.getNoAuth('/config', (_req: PluginHttpRequest, res: PluginHttpResponse) => {
        res.json({ code: 0, data: pluginState.getConfig() });
    });

    router.postNoAuth('/config', async (req: PluginHttpRequest, res: PluginHttpResponse) => {
        try {
            pluginState.setConfig(ctx, parseBody(req) as Partial<PluginConfig>);
            await censorService.initialize(pluginState.config);
            res.json({ code: 0, message: 'ok' });
        } catch (error) {
            pluginState.log('error', 'Failed to save config', error);
            sendError(res, 500, error);
        }
    });

    router.postNoAuth('/dictionary/reload', async (_req: PluginHttpRequest, res: PluginHttpResponse) => {
        try {
            await censorService.reloadDictionary(pluginState.config);
            res.json({ code: 0, data: { dictionarySize: censorService.dictionarySize } });
        } catch (error) {
            pluginState.log('error', 'Failed to reload dictionary', error);
            sendError(res, 500, error);
        }
    });

    router.getNoAuth('/groups', async (_req: PluginHttpRequest, res: PluginHttpResponse) => {
        try {
            const groups = await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config
            ) as OB11Group[];

            res.json({
                code: 0,
                data: (groups || []).map((group) => ({
                    ...group,
                    enabled: pluginState.shouldCensorGroup(group.group_id),
                })),
            });
        } catch (error) {
            pluginState.log('error', 'Failed to fetch groups', error);
            sendError(res, 500, error);
        }
    });

    router.postNoAuth('/groups/:id/config', async (req: PluginHttpRequest, res: PluginHttpResponse) => {
        try {
            const groupId = String(req.params?.id || '');
            if (!groupId) {
                sendError(res, 400, 'Missing group id');
                return;
            }

            const enabled = parseBody(req).enabled;
            if (typeof enabled !== 'boolean') {
                sendError(res, 400, 'enabled must be boolean');
                return;
            }

            pluginState.updateGroupConfig(ctx, groupId, { enabled });
            res.json({ code: 0, message: 'ok' });
        } catch (error) {
            pluginState.log('error', 'Failed to update group config', error);
            sendError(res, 500, error);
        }
    });

    router.postNoAuth('/groups/bulk-config', async (req: PluginHttpRequest, res: PluginHttpResponse) => {
        try {
            const body = parseBody(req);
            const { enabled, groupIds } = body;

            if (typeof enabled !== 'boolean' || !Array.isArray(groupIds)) {
                sendError(res, 400, 'enabled and groupIds are required');
                return;
            }

            const groupConfigs = { ...(pluginState.config.groupConfigs || {}) };
            for (const groupId of groupIds) {
                groupConfigs[String(groupId)] = {
                    ...groupConfigs[String(groupId)],
                    enabled,
                };
            }

            pluginState.setConfig(ctx, { groupConfigs });
            res.json({ code: 0, message: 'ok' });
        } catch (error) {
            pluginState.log('error', 'Failed to update groups in bulk', error);
            sendError(res, 500, error);
        }
    });

    pluginState.logDebug('API routes registered');
}
