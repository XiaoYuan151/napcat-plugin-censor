import type { NapCatPluginContext } from './napcat';
import type { PluginConfig } from './types';

export const DEFAULT_DICTIONARY_URL = 'https://xiaoyuan151.github.io/censor/dictionary.b64';
export const DEFAULT_GUARD_API_URL = 'https://xiaoyuan151-qwen3guard-gen-0-6b.hf.space/v1/chat/completions';

export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    adminIds: '',
    censorGroups: '',
    censorWords: '',
    maxViolations: 10,
    banDurationSeconds: 600,
    reportBatchSize: 10,
    showFilterNotice: true,
    dictionaryUrl: DEFAULT_DICTIONARY_URL,
    guardApiUrl: DEFAULT_GUARD_API_URL,
    guardTimeoutMs: 10000,
    groupConfigs: {},
};

export function initConfigUI(ctx: NapCatPluginContext) {
    const { NapCatConfig } = ctx;

    return NapCatConfig.combine(
        NapCatConfig.html(`
            <div style="padding: 14px 16px; border-radius: 8px; background: #f6f8fa; margin-bottom: 16px;">
                <strong>群组消息审查</strong>
                <p style="margin: 6px 0 0; color: #57606a; font-size: 13px;">按群启用敏感词和模型审查，自动撤回违规消息。</p>
            </div>
        `),
        NapCatConfig.boolean('enabled', '启用插件', DEFAULT_CONFIG.enabled, '关闭后不处理任何消息'),
        NapCatConfig.boolean('debug', '调试日志', DEFAULT_CONFIG.debug, '输出更详细的运行日志'),
        NapCatConfig.text('adminIds', '管理员 QQ', DEFAULT_CONFIG.adminIds, '多个 QQ 使用英文逗号分隔，用于接收违规记录'),
        NapCatConfig.text('censorGroups', '审查群号', DEFAULT_CONFIG.censorGroups, '多个群号使用英文逗号分隔；也可在 WebUI 群管理中启用'),
        NapCatConfig.text('censorWords', '自定义敏感词', DEFAULT_CONFIG.censorWords, '多个词使用英文逗号分隔，优先于词库检查'),
        NapCatConfig.number('maxViolations', '禁言触发次数', DEFAULT_CONFIG.maxViolations, '同一用户达到次数后自动禁言，0 表示不禁言'),
        NapCatConfig.number('banDurationSeconds', '禁言时长（秒）', DEFAULT_CONFIG.banDurationSeconds, '触发禁言后的持续时间'),
        NapCatConfig.number('reportBatchSize', '违规记录批量发送数', DEFAULT_CONFIG.reportBatchSize, '累计多少条违规记录后发送给管理员'),
        NapCatConfig.boolean('showFilterNotice', '发送过滤提示', DEFAULT_CONFIG.showFilterNotice, '撤回消息后在群内提示用户'),
        NapCatConfig.text('dictionaryUrl', '远程词库地址', DEFAULT_CONFIG.dictionaryUrl, '本地词库不可用时会从该地址加载 base64 词库'),
        NapCatConfig.text('guardApiUrl', '模型审查 API', DEFAULT_CONFIG.guardApiUrl, '兼容 OpenAI chat completions 的审查接口'),
        NapCatConfig.number('guardTimeoutMs', '模型审查超时（毫秒）', DEFAULT_CONFIG.guardTimeoutMs, '超过时间则跳过模型结果')
    );
}

export function getDefaultConfig(): PluginConfig {
    return {
        ...DEFAULT_CONFIG,
        groupConfigs: {},
    };
}
