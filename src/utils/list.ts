export function splitList(value: string | undefined, separator: string | RegExp = ','): string[] {
    if (!value) return [];

    return value
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function splitCommaList(value: string | undefined): string[] {
    return splitList(value, /[,，\n\r]+/);
}
