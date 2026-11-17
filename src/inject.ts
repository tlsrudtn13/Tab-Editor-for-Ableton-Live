// Payload injection for the editor page (pure, no SDK).

/** Backslash + "u003c": the JS string escape for "<" (built from char codes so no tool unescapes it). */
const ESCAPED_LT = String.fromCharCode(92) + "u003c";

/**
 * A JavaScript string literal holding `value` as JSON, safe inside an inline script element:
 * every less-than sign is written as an escape, so the JSON can never close the script element
 * or open an HTML comment. Use as `JSON.parse(${injectableJson(value)})`.
 */
export function injectableJson(value: unknown): string {
    return JSON.stringify(JSON.stringify(value)).split("<").join(ESCAPED_LT);
}
