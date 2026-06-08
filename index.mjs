import fs from "node:fs";
import path from "node:path";
const DEFAULT_CONFIG = {
  adminIds: "10001,10002",
  censorGroups: "10001,10002,10003,10004",
  censorWords: "关键词,关键词,关键词",
  maxAgainst: "10",
  banDuration: "600",
  sendTime: "10",
  filterMsg: true,
};
let currentConfig = { ...DEFAULT_CONFIG };
let badWords = ["关键词"];
const againstTimes = { 10001: 0 };
function loadConfig(ctx) {
  fetch("https://xiaoyuan151.github.io/censor/dictionary.b64").then((data) => {
    data.text().then((rawContent) => {
      const cleanBase64 = rawContent
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s/g, "");
      const decodedString = Buffer.from(cleanBase64, "base64").toString(
        "utf-8",
      );
      badWords = splitList(decodedString, "\n");
    });
  });
  const configPath = ctx.configPath;
  try {
    if (fs.existsSync(configPath)) {
      currentConfig = {
        ...DEFAULT_CONFIG,
        ...JSON.parse(fs.readFileSync(configPath, "utf-8")),
      };
    } else {
      saveConfig(ctx, DEFAULT_CONFIG);
    }
  } catch {
    return;
  }
}
function saveConfig(ctx, cfg) {
  currentConfig = { ...currentConfig, ...cfg };
  const configDir = path.dirname(ctx.configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(ctx.configPath, JSON.stringify(currentConfig, null, 2));
}
function buildConfigUI(ctx) {
  const { NapCatConfig } = ctx;
  return NapCatConfig.combine(
    NapCatConfig.html("<h3>群组消息审查</h3>"),
    NapCatConfig.text(
      "adminIds",
      "用于接收日志的 QQ 号：",
      DEFAULT_CONFIG.adminIds,
      "如有多个 QQ 号请使用英文逗号分隔。",
    ),
    NapCatConfig.text(
      "censorGroups",
      "需要启用过滤器的群号：",
      DEFAULT_CONFIG.censorGroups,
      "如有多个群号请使用英文逗号分隔。",
    ),
    NapCatConfig.text(
      "censorWords",
      "需要过滤的词语：",
      DEFAULT_CONFIG.censorWords,
      "如有多个词语请使用英文逗号分隔。",
    ),
    NapCatConfig.text(
      "maxAgainst",
      "最大违规次数：",
      DEFAULT_CONFIG.maxAgainst,
      "达到后则违规者会被禁言。",
    ),
    NapCatConfig.text(
      "banDuration",
      "违规者禁言时长：",
      DEFAULT_CONFIG.banDuration,
      "此处单位：秒。",
    ),
    NapCatConfig.text(
      "sendTime",
      "每多少条记录发送给管理员：",
      DEFAULT_CONFIG.sendTime,
      "在此处填入一个整数。",
    ),
    NapCatConfig.boolean(
      "filterMsg",
      "是否启用过滤提示？",
      DEFAULT_CONFIG.filterMsg,
      "选中此处以启用过滤提示。",
    ),
  );
}
async function sendGroupMessage(ctx, groupId, message) {
  try {
    await ctx.actions.call(
      "send_group_msg",
      {
        group_id: groupId,
        message: message,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
    return true;
  } catch {
    return false;
  }
}
async function sendPrivateMessage(ctx, userId, message) {
  try {
    await ctx.actions.call(
      "send_private_msg",
      {
        user_id: userId,
        message: message,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
    return true;
  } catch {
    return false;
  }
}
async function sendPrivateForwardMsg(ctx, userId, nodes) {
  try {
    await ctx.actions.call(
      "send_private_forward_msg",
      {
        user_id: userId,
        messages: nodes,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
    return true;
  } catch {
    return false;
  }
}
async function getStrangerInfo(ctx, userId) {
  try {
    return await ctx.actions.call(
      "get_stranger_info",
      {
        user_id: userId,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
  } catch {
    return;
  }
}
async function deleteMessage(ctx, messageId) {
  try {
    await ctx.actions.call(
      "delete_msg",
      {
        message_id: messageId,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
    return true;
  } catch {
    return false;
  }
}
async function setGroupBan(ctx, groupId, userId, duration) {
  try {
    return await ctx.actions.call(
      "set_group_ban",
      {
        group_id: groupId,
        user_id: userId,
        duration: duration,
      },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
  } catch {
    return;
  }
}
function textSegment(text) {
  return { type: "text", data: { text } };
}
function atSegment(qq) {
  return { type: "at", data: { qq: qq } };
}
function buildForwardNode(userId, nickname, content) {
  return {
    type: "node",
    data: { user_id: userId, nickname, content },
  };
}
function splitList(string, separator = ",") {
  return string
    .split(separator)
    .map((value) => value.trim())
    .filter(Boolean);
}
function isCensored(groupId) {
  if (!currentConfig.censorGroups.trim()) return false;
  return splitList(currentConfig.censorGroups).includes(groupId);
}
async function checkSafety(message) {
  for (const censorWord of splitList(currentConfig.censorWords)) {
    if (message.toLowerCase().includes(censorWord.toLowerCase())) {
      return "Unsafe";
    }
  }
  for (const badWord of badWords) {
    if (message.toLowerCase().includes(badWord.toLowerCase())) {
      return "Unsafe";
    }
  }
  const url =
    "https://xiaoyuan151-qwen3guard-gen-0-6b.hf.space/v1/chat/completions";
  const body = JSON.stringify({
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
    temperature: 0.1,
    max_tokens: 128,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    return data.choices[0].message.content;
  } catch {
    return;
  }
}
let plugin_config_ui = new Array();
async function plugin_init(ctx) {
  loadConfig(ctx);
  plugin_config_ui = buildConfigUI(ctx);
}
const messageLogs = new Array();
async function plugin_onmessage(ctx, event) {
  try {
    if (event.post_type === "message_sent") {
      return;
    }
    const messageType = event.message_type;
    const rawMessage = event.raw_message;
    const groupId = event.group_id;
    const userId = event.user_id;
    const messageId = event.message_id;
    const userInfo = await getStrangerInfo(ctx, userId);
    const userNickname = userInfo.nickname;
    if (messageType === "group" && groupId) {
      if (isCensored(groupId)) {
        return;
      }
    }
    if (rawMessage.includes("[CQ")) {
      return;
    } else {
      const msgSafety = await checkSafety(rawMessage);
      if (messageType === "group" && msgSafety.includes("Unsafe")) {
        messageLogs.push(
          buildForwardNode(userId, userNickname, [textSegment(rawMessage)]),
        );
        againstTimes[userId] = (againstTimes[userId] || 0) + 1;
        if (againstTimes[userId] >= currentConfig.maxAgainst) {
          setGroupBan(ctx, groupId, userId, currentConfig.banDuration);
          againstTimes[userId] = 0;
        }
        deleteMessage(ctx, messageId);
        if (currentConfig.filterMsg) {
          await sendGroupMessage(ctx, groupId, [
            atSegment(userId),
            textSegment(
              " 你尝试发送的消息已被过滤，此消息已被记录并发送至群组管理员。",
            ),
          ]);
        }
        if (messageLogs.length >= currentConfig.sendTime) {
          for (const adminId of splitList(currentConfig.adminIds)) {
            await sendPrivateForwardMsg(ctx, adminId, messageLogs);
          }
          messageLogs.length = 0;
        }
      }
    }
  } catch {
    return;
  }
}
async function plugin_get_config() {
  return currentConfig;
}
function plugin_on_config_change(ctx, _, key, value) {
  saveConfig(ctx, { [key]: value });
}
export {
  plugin_init,
  plugin_config_ui,
  plugin_onmessage,
  plugin_get_config,
  plugin_on_config_change,
};
