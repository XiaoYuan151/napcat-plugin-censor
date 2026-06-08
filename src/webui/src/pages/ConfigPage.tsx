import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconRefresh, IconTerminal } from '../components/icons'

export default function ConfigPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [saving, setSaving] = useState(false)
    const [reloading, setReloading] = useState(false)

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch {
            showToast('获取配置失败', 'error')
        }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveConfig = useCallback(async (update: Partial<PluginConfig>) => {
        if (!config) return
        const nextConfig = { ...config, ...update }
        setConfig(nextConfig)
        setSaving(true)

        try {
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(nextConfig),
            })
            showToast('配置已保存', 'success')
        } catch {
            setConfig(config)
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [config])

    const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
        saveConfig({ [key]: value } as Partial<PluginConfig>)
    }

    const reloadDictionary = async () => {
        setReloading(true)
        try {
            await noAuthFetch('/dictionary/reload', { method: 'POST' })
            showToast('词库已重新加载', 'success')
        } catch {
            showToast('词库加载失败', 'error')
        } finally {
            setReloading(false)
        }
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载配置中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 stagger-children">
            <div className="card p-5 hover-lift">
                <div className="flex items-center justify-between gap-3 mb-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <IconTerminal size={16} className="text-gray-400" />
                        基础配置
                    </h3>
                    <button className="btn btn-ghost text-xs" onClick={reloadDictionary} disabled={reloading}>
                        <IconRefresh size={13} />
                        {reloading ? '加载中' : '重载词库'}
                    </button>
                </div>

                <div className="space-y-5">
                    <ToggleRow
                        label="启用插件"
                        desc="关闭后不会审查任何消息"
                        checked={config.enabled}
                        onChange={(value) => updateField('enabled', value)}
                    />
                    <ToggleRow
                        label="调试日志"
                        desc="输出更详细的运行日志"
                        checked={config.debug}
                        onChange={(value) => updateField('debug', value)}
                    />
                    <ToggleRow
                        label="发送过滤提示"
                        desc="撤回违规消息后在群内提示用户"
                        checked={config.showFilterNotice}
                        onChange={(value) => updateField('showFilterNotice', value)}
                    />
                    <InputRow
                        label="管理员 QQ"
                        desc="多个 QQ 使用英文逗号分隔"
                        value={config.adminIds}
                        onChange={(value) => updateField('adminIds', value)}
                    />
                    <InputRow
                        label="审查群号"
                        desc="多个群号使用英文逗号分隔；也可在群管理中启用"
                        value={config.censorGroups}
                        onChange={(value) => updateField('censorGroups', value)}
                    />
                    <TextAreaRow
                        label="自定义敏感词"
                        desc="多个词使用英文逗号、中文逗号或换行分隔"
                        value={config.censorWords}
                        onChange={(value) => updateField('censorWords', value)}
                    />
                    <div className="grid gap-4 sm:grid-cols-3">
                        <InputRow
                            label="禁言触发次数"
                            desc="0 表示不自动禁言"
                            value={String(config.maxViolations)}
                            type="number"
                            onChange={(value) => updateField('maxViolations', Number(value) || 0)}
                        />
                        <InputRow
                            label="禁言时长（秒）"
                            desc="触发禁言后的持续时间"
                            value={String(config.banDurationSeconds)}
                            type="number"
                            onChange={(value) => updateField('banDurationSeconds', Number(value) || 0)}
                        />
                        <InputRow
                            label="上报批量"
                            desc="累计多少条后发给管理员"
                            value={String(config.reportBatchSize)}
                            type="number"
                            onChange={(value) => updateField('reportBatchSize', Math.max(1, Number(value) || 1))}
                        />
                    </div>
                    <InputRow
                        label="远程词库地址"
                        desc="本地词库不可用时加载该 base64 词库"
                        value={config.dictionaryUrl}
                        onChange={(value) => updateField('dictionaryUrl', value)}
                    />
                    <InputRow
                        label="模型审查 API"
                        desc="兼容 OpenAI chat completions 的接口；留空则只使用词库"
                        value={config.guardApiUrl}
                        onChange={(value) => updateField('guardApiUrl', value)}
                    />
                    <InputRow
                        label="模型超时（毫秒）"
                        desc="超时后跳过模型结果"
                        value={String(config.guardTimeoutMs)}
                        type="number"
                        onChange={(value) => updateField('guardTimeoutMs', Math.max(1000, Number(value) || 10000))}
                    />
                </div>
            </div>

            {saving && (
                <div className="saving-indicator fixed bottom-4 right-4 bg-primary text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
                    保存中...
                </div>
            )}
        </div>
    )
}

function ToggleRow({ label, desc, checked, onChange }: {
    label: string
    desc: string
    checked: boolean
    onChange: (value: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <label className="toggle">
                <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
                <div className="slider" />
            </label>
        </div>
    )
}

function InputRow({ label, desc, value, type = 'text', onChange }: {
    label: string
    desc: string
    value: string
    type?: string
    onChange: (value: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <input
                className="input-field"
                type={type}
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={(event) => event.key === 'Enter' && handleBlur()}
            />
        </div>
    )
}

function TextAreaRow({ label, desc, value, onChange }: {
    label: string
    desc: string
    value: string
    onChange: (value: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <textarea
                className="input-field min-h-24 resize-y"
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                onBlur={handleBlur}
            />
        </div>
    )
}
