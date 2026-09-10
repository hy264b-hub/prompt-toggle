export const KEY = 'st_global_prompt_toggle_v1';
export const PREFIX = KEY + ':';
export const clampDepth = value => Number.isFinite(Number(value)) ? Math.min(10000, Math.max(0, Math.trunc(Number(value)))) : 2;
const uid = () => globalThis.crypto?.randomUUID?.() ?? `p${Date.now()}${Math.random().toString(36).slice(2)}`;
export function newItem(seed = {}) {
    return { id: uid(), title: '새 지시문', text: '', enabled: false, position: 'after', depth: 2, role: 0, ...seed };
}
export function normalize(raw) {
    const valid = raw && typeof raw === 'object' && !Array.isArray(raw);
    if (!valid) raw = {};
    if (!Array.isArray(raw.items)) {
        const legacy = Object.hasOwn(raw, 'text');
        raw = { schemaVersion: 2, enabled: true, includeQuiet: raw.includeQuiet === true,
            items: legacy ? [newItem({title:'기존 지시문', text:raw.text, enabled:raw.enabled === true,
                position:raw.position, depth:raw.depth, role:raw.role})] : [newItem()],
            ...(legacy ? { legacyV1: structuredClone(raw) } : {}) };
    }
    const seen = new Set();
    raw.items = raw.items.filter(x => x && typeof x === 'object').map(x => {
        let id = typeof x.id === 'string' && x.id ? x.id : uid();
        if (seen.has(id)) id = uid();
        seen.add(id);
        return { id, title: typeof x.title === 'string' ? x.title : '지시문',
            text: typeof x.text === 'string' ? x.text : '', enabled:x.enabled === true,
            position:['after','before','custom'].includes(x.position) ? x.position : 'after',
            depth:clampDepth(x.depth), role:[0,1,2].includes(Number(x.role)) ? Number(x.role) : 0 };
    });
    raw.schemaVersion = 2;
    raw.enabled = raw.enabled !== false;
    raw.includeQuiet = raw.includeQuiet === true;
    return raw;
}
export function itemDepth(item) { return item.position === 'after' ? 0 : item.position === 'before' ? 1 : item.depth; }
export function planInjections(s, type) {
    if (!s.enabled || (type === 'quiet' && !s.includeQuiet)) return [];
    const groups = new Map();
    for (const item of s.items) {
        if (!item.enabled || !item.text.trim()) continue;
        const depth = itemDepth(item), key = `${PREFIX}${depth}:${item.role}`;
        if (!groups.has(key)) groups.set(key, {key,depth,role:item.role,texts:[]});
        groups.get(key).texts.push(item.text);
    }
    return [...groups.values()].map(({texts,...group}) => ({...group,text:texts.join('\n\n')}));
}
