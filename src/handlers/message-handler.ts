import { pluginState } from '../core/state';
import type { NapCatPluginContext, OB11Message } from '../napcat';
import { censorService } from '../services/censor-service';
import type { CensorDecision, ForwardNode, MessageSegment } from '../types';
import { splitCommaList } from '../utils/list';

const violationCounts = new Map<string, number>();
const pendingReports: ForwardNode[] = [];

type MessageEventLike = OB11Message & {
    message_type?: string;
    group_id?: number | string;
    user_id?: number | string;
    message_id?: number | string;
    raw_message?: string;
    post_type?: string;
};

export async function sendGroupMessage(ctx: NapCatPluginContext, groupId: number | string, message: MessageSegment[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_msg',
            { group_id: groupId, message },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to send group message', error);
        return false;
    }
}

export async function sendPrivateMessage(ctx: NapCatPluginContext, userId: number | string, message: MessageSegment[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_private_msg',
            { user_id: userId, message },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to send private message', error);
        return false;
    }
}

export async function sendPrivateForwardMsg(ctx: NapCatPluginContext, userId: number | string, nodes: ForwardNode[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_private_forward_msg',
            { user_id: userId, messages: nodes },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to send private forward message', error);
        return false;
    }
}

export async function sendGroupForwardMsg(ctx: NapCatPluginContext, groupId: number | string, nodes: ForwardNode[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_forward_msg',
            { group_id: groupId, messages: nodes },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to send group forward message', error);
        return false;
    }
}

export async function setMsgEmojiLike(ctx: NapCatPluginContext, messageId: string | number, emojiId: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'set_msg_emoji_like',
            { message_id: messageId, emoji_id: emojiId },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to set message emoji like', error);
        return false;
    }
}

export async function uploadGroupFile(ctx: NapCatPluginContext, groupId: number | string, filePath: string, fileName: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'upload_group_file',
            { group_id: groupId, file: filePath, name: fileName },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to upload group file', error);
        return false;
    }
}

async function deleteMessage(ctx: NapCatPluginContext, messageId: number | string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'delete_msg',
            { message_id: messageId },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to delete unsafe message', error);
        return false;
    }
}

async function setGroupBan(ctx: NapCatPluginContext, groupId: number | string, userId: number | string, duration: number): Promise<boolean> {
    try {
        await ctx.actions.call(
            'set_group_ban',
            { group_id: groupId, user_id: userId, duration },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', 'Failed to ban group member', error);
        return false;
    }
}

async function getNickname(ctx: NapCatPluginContext, userId: number | string): Promise<string> {
    try {
        const result = await ctx.actions.call(
            'get_stranger_info',
            { user_id: userId },
            ctx.adapterName,
            ctx.pluginManager.config
        );

        if (result && typeof result === 'object' && 'nickname' in result) {
            const nickname = (result as { nickname?: unknown }).nickname;
            if (typeof nickname === 'string' && nickname.trim()) return nickname;
        }
    } catch (error) {
        pluginState.logDebug('Failed to fetch user nickname', error);
    }

    return String(userId);
}

export function textSegment(text: string): MessageSegment {
    return { type: 'text', data: { text } };
}

export function imageSegment(file: string): MessageSegment {
    return { type: 'image', data: { file } };
}

export function atSegment(qq: string | number): MessageSegment {
    return { type: 'at', data: { qq: String(qq) } };
}

export function replySegment(messageId: string | number): MessageSegment {
    return { type: 'reply', data: { id: String(messageId) } };
}

export function buildForwardNode(userId: string | number, nickname: string, content: MessageSegment[]): ForwardNode {
    return {
        type: 'node',
        data: { user_id: String(userId), nickname, content },
    };
}

function shouldIgnoreMessage(event: MessageEventLike): boolean {
    if (event.post_type === 'message_sent') return true;
    if (event.message_type !== 'group') return true;
    if (!event.group_id || !event.user_id || !event.message_id) return true;
    if (!event.raw_message?.trim()) return true;
    return event.raw_message.includes('[CQ');
}

function buildReportText(event: MessageEventLike, decision: CensorDecision): string {
    const lines = [
        `群号: ${event.group_id}`,
        `用户: ${event.user_id}`,
        `消息: ${event.raw_message}`,
    ];

    if (decision.source) lines.push(`来源: ${decision.source}`);
    if (decision.matchedWord) lines.push(`命中: ${decision.matchedWord}`);
    if (decision.guardResponse) lines.push(`模型: ${decision.guardResponse}`);

    return lines.join('\n');
}

async function flushReports(ctx: NapCatPluginContext): Promise<void> {
    const adminIds = splitCommaList(pluginState.config.adminIds);
    if (adminIds.length === 0 || pendingReports.length === 0) return;

    const reports = pendingReports.splice(0, pendingReports.length);
    for (const adminId of adminIds) {
        if (await sendPrivateForwardMsg(ctx, adminId, reports)) {
            pluginState.markReported();
        }
    }
}

async function handleViolation(ctx: NapCatPluginContext, event: MessageEventLike, decision: CensorDecision): Promise<void> {
    const groupId = event.group_id!;
    const userId = event.user_id!;
    const messageId = event.message_id!;
    const nickname = await getNickname(ctx, userId);

    pendingReports.push(buildForwardNode(userId, nickname, [textSegment(buildReportText(event, decision))]));
    pluginState.markBlocked();

    await deleteMessage(ctx, messageId);

    const countKey = `${groupId}:${userId}`;
    const violationCount = (violationCounts.get(countKey) || 0) + 1;
    violationCounts.set(countKey, violationCount);

    const { maxViolations, banDurationSeconds, showFilterNotice, reportBatchSize } = pluginState.config;
    if (maxViolations > 0 && violationCount >= maxViolations) {
        if (await setGroupBan(ctx, groupId, userId, banDurationSeconds)) {
            violationCounts.set(countKey, 0);
            pluginState.markBanned();
        }
    }

    if (showFilterNotice) {
        await sendGroupMessage(ctx, groupId, [
            atSegment(userId),
            textSegment(' 你发送的消息已被过滤，并已记录给管理员。'),
        ]);
    }

    if (pendingReports.length >= reportBatchSize) {
        await flushReports(ctx);
    }
}

export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    const messageEvent = event as MessageEventLike;

    try {
        if (shouldIgnoreMessage(messageEvent)) return;
        if (!pluginState.config.enabled) return;

        const groupId = messageEvent.group_id!;
        if (!pluginState.shouldCensorGroup(groupId)) {
            pluginState.logDebug(`Group ${groupId} is not configured for censoring`);
            return;
        }

        pluginState.markProcessed();

        const decision = await censorService.checkMessage(messageEvent.raw_message!, pluginState.config);
        if (decision.unsafe) {
            await handleViolation(ctx, messageEvent, decision);
        }

        pluginState.persistStats(ctx);
    } catch (error) {
        pluginState.log('error', 'Failed to handle message', error);
    }
}
