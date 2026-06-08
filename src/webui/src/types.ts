export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    dictionarySize: number
    stats: {
        processed: number
        todayProcessed: number
        blocked: number
        reported: number
        banned: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    adminIds: string
    censorGroups: string
    censorWords: string
    maxViolations: number
    banDurationSeconds: number
    reportBatchSize: number
    showFilterNotice: boolean
    dictionaryUrl: string
    guardApiUrl: string
    guardTimeoutMs: number
    groupConfigs?: Record<string, GroupConfig>
}

export interface GroupConfig {
    enabled?: boolean
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}
