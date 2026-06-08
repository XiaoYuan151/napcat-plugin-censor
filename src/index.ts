import type {
    NapCatPluginContext,
    OB11Message,
    PluginConfigSchema,
    PluginConfigUIController,
    PluginHttpRequest,
    PluginHttpResponse,
} from './napcat';
import { initConfigUI } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import { registerApiRoutes } from './services/api-service';
import { censorService } from './services/censor-service';
import type { PluginConfig } from './types';

export let plugin_config_ui: PluginConfigSchema = [];

const plugin_init = async (ctx: NapCatPluginContext) => {
    try {
        pluginState.initFromContext(ctx);
        pluginState.loadConfig(ctx);

        plugin_config_ui = initConfigUI(ctx) || [];
        await censorService.initialize(pluginState.config);

        const router = ctx.router;
        if (router) {
            router.static('/static', 'webui');
            router.get('/static/plugin-info.js', (_req: PluginHttpRequest, res: PluginHttpResponse) => {
                res.setHeader('Content-Type', 'application/javascript');
                res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
            });

            registerApiRoutes(ctx);

            if (router.page) {
                router.page({
                    path: 'plugin-censor',
                    title: '群组消息审查',
                    icon: 'shield',
                    htmlFile: 'webui/index.html',
                    description: '审查群组消息并自动撤回违规内容',
                });
            }
        }

        pluginState.log('info', `Initialized ${ctx.pluginName}; dictionary words=${censorService.dictionarySize}`);
    } catch (error) {
        pluginState.log('error', 'Plugin initialization failed', error);
    }
};

const plugin_onmessage = async (ctx: NapCatPluginContext, event: OB11Message) => {
    if (event.post_type !== 'message' || !event.raw_message) return;
    await handleMessage(ctx, event);
};

const plugin_cleanup = async (_ctx: NapCatPluginContext) => {
    pluginState.log('info', 'Plugin cleanup completed');
};

export const plugin_get_config = async (_ctx: NapCatPluginContext) => {
    return pluginState.getConfig();
};

export const plugin_set_config = async (ctx: NapCatPluginContext, config: PluginConfig) => {
    pluginState.replaceConfig(ctx, config);
    await censorService.initialize(pluginState.config);
};

export const plugin_on_config_change = async (
    ctx: NapCatPluginContext,
    _ui: PluginConfigUIController,
    key: string,
    value: unknown
) => {
    pluginState.setConfig(ctx, { [key]: value } as Partial<PluginConfig>);

    if (key === 'dictionaryUrl') {
        await censorService.initialize(pluginState.config);
    }
};

export {
    plugin_cleanup,
    plugin_init,
    plugin_onmessage,
};
