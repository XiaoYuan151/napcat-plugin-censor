import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CensorDecision, PluginConfig } from '../types';
import { splitCommaList, splitList } from '../utils/list';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function uniquePaths(paths: string[]): string[] {
    return [...new Set(paths)];
}

function getAssetCandidates(fileName: string): string[] {
    return uniquePaths([
        path.resolve(moduleDir, fileName),
        path.resolve(process.cwd(), fileName),
        path.resolve(process.cwd(), 'dist', fileName),
    ]);
}

async function readFirstExistingFile(fileName: string): Promise<string | undefined> {
    for (const filePath of getAssetCandidates(fileName)) {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            // Try the next candidate.
        }
    }
    return undefined;
}

function decodeBase64Dictionary(raw: string): string {
    const cleanBase64 = raw
        .replace(/-----BEGIN.*?-----/g, '')
        .replace(/-----END.*?-----/g, '')
        .replace(/\s/g, '');

    return Buffer.from(cleanBase64, 'base64').toString('utf-8');
}

function normalizeWords(raw: string): string[] {
    const seen = new Set<string>();
    const words: string[] = [];

    for (const word of splitList(raw, /[\r\n]+/)) {
        const normalized = word.trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        words.push(normalized);
    }

    return words;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractGuardResponse(data: unknown): string | undefined {
    if (!isRecord(data)) return undefined;
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) return undefined;

    const message = choices[0].message;
    if (!isRecord(message)) return undefined;

    return typeof message.content === 'string' ? message.content : undefined;
}

function isUnsafeGuardResponse(content: string): boolean {
    return /\bunsafe\b/i.test(content) || /不安全|违规|违规内容/.test(content);
}

class CensorService {
    private dictionaryWords: string[] = [];
    private loadedDictionaryUrl = '';
    private initialized = false;

    get dictionarySize(): number {
        return this.dictionaryWords.length;
    }

    async initialize(config: PluginConfig): Promise<void> {
        await this.reloadDictionary(config);
        this.initialized = true;
    }

    async reloadDictionary(config: PluginConfig): Promise<void> {
        const localText = await readFirstExistingFile('dictionary.txt');
        if (localText) {
            this.dictionaryWords = normalizeWords(localText);
            this.loadedDictionaryUrl = 'local:dictionary.txt';
            return;
        }

        const localBase64 = await readFirstExistingFile('dictionary.b64');
        if (localBase64) {
            this.dictionaryWords = normalizeWords(decodeBase64Dictionary(localBase64));
            this.loadedDictionaryUrl = 'local:dictionary.b64';
            return;
        }

        if (!config.dictionaryUrl) {
            this.dictionaryWords = [];
            this.loadedDictionaryUrl = '';
            return;
        }

        const response = await fetch(config.dictionaryUrl);
        if (!response.ok) {
            throw new Error(`Dictionary download failed: HTTP ${response.status}`);
        }

        const raw = await response.text();
        this.dictionaryWords = normalizeWords(decodeBase64Dictionary(raw));
        this.loadedDictionaryUrl = config.dictionaryUrl;
    }

    async checkMessage(message: string, config: PluginConfig): Promise<CensorDecision> {
        if (!this.initialized || (config.dictionaryUrl && this.loadedDictionaryUrl === '' && this.dictionaryWords.length === 0)) {
            await this.initialize(config);
        }

        const normalizedMessage = message.toLowerCase();
        const customDecision = this.matchWords(normalizedMessage, splitCommaList(config.censorWords), 'custom');
        if (customDecision.unsafe) return customDecision;

        const dictionaryDecision = this.matchWords(normalizedMessage, this.dictionaryWords, 'dictionary');
        if (dictionaryDecision.unsafe) return dictionaryDecision;

        return this.checkGuard(message, config);
    }

    private matchWords(message: string, words: string[], source: 'custom' | 'dictionary'): CensorDecision {
        for (const word of words) {
            const normalizedWord = word.toLowerCase();
            if (!normalizedWord) continue;
            if (message.includes(normalizedWord)) {
                return { unsafe: true, source, matchedWord: word };
            }
        }

        return { unsafe: false };
    }

    private async checkGuard(message: string, config: PluginConfig): Promise<CensorDecision> {
        if (!config.guardApiUrl) return { unsafe: false };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.guardTimeoutMs);

        try {
            const response = await fetch(config.guardApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: message }],
                    temperature: 0.1,
                    max_tokens: 128,
                }),
                signal: controller.signal,
            });

            if (!response.ok) return { unsafe: false };

            const content = extractGuardResponse(await response.json());
            if (!content) return { unsafe: false };

            return {
                unsafe: isUnsafeGuardResponse(content),
                source: 'guard',
                guardResponse: content,
            };
        } catch {
            return { unsafe: false };
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export const censorService = new CensorService();
