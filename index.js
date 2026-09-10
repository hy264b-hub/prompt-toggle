// SillyTavern getContext API. No imports from internal module paths.
const KEY = 'st_global_prompt_toggle_v1';
const ID = 'st-global-prompt-toggle';
const IN_CHAT = 1;
const DEFAULTS = { enabled: false, text: '', position: 'after', depth: 2, role: 0, includeQuiet: false };
let suspended = false;
let root;
let wired = false;
const context = () => globalThis.SillyTavern.getContext();

function settings() {
    const ctx = context();
    const old = ctx.extensionSettings[KEY];
    if (!old || typeof old !== 'object' || Array.isArray(old)) ctx.extensionSettings[KEY] = { ...DEFAULTS };
    const s = ctx.extensionSettings[KEY];
    for (const [key, value] of Object.entries(DEFAULTS)) if (s[key] === undefined) s[key] = value;
    s.enabled = s.enabled === true;
    s.includeQuiet = s.includeQuiet === true;
    s.text = typeof s.text === 'string' ? s.text : '';
    if (!['after', 'before', 'custom'].includes(s.position)) s.position = 'after';
    s.depth = Number.isFinite(Number(s.depth)) ? Math.min(10000, Math.max(0, Math.trunc(Number(s.depth)))) : 2;
    s.role = [0, 1, 2].includes(Number(s.role)) ? Number(s.role) : 0;
    return s;
}

function depth(s) { return s.position === 'after' ? 0 : s.position === 'before' ? 1 : s.depth; }

function clearPrompt() {
    const ctx = context();
    if (ctx.extensionPrompts) delete ctx.extensionPrompts[KEY];
    else ctx.setExtensionPrompt?.(KEY, '', IN_CHAT, 0, false, 0);
}

function syncPrompt(type) {
    const ctx = context();
    const s = settings();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        throw new Error('현재 실리태번에서 프롬프트 삽입 API를 찾을 수 없어요. 실리태번 버전을 확인해 주세요.');
    }
    if (suspended || !s.enabled || !s.text.trim() || (type === 'quiet' && !s.includeQuiet)) {
        clearPrompt();
        return;
    }
    // Stable key overwrites this extension's previous injection (no accumulation).
    // scan=false: this instruction does not itself trigger World Info keywords.
    ctx.setExtensionPrompt(KEY, s.text, IN_CHAT, depth(s), false, s.role);
}

function report(error) {
    console.error('[공통 프롬프트 토글]', error);
    if (root) {
        root.querySelector('[data-status]').textContent = error.message;
        root.querySelector('[data-status]').dataset.error = 'true';
    }
}

function refresh(type) {
    try { syncPrompt(type); renderState(); } catch (error) { report(error); }
}

// Called again for each real generation, including after a chat/preset switch.
globalThis.stGlobalPromptToggleInterceptor = (_chat, _size, abort, type) => {
    try { syncPrompt(type); } catch (error) {
        report(error);
        if (settings().enabled) { globalThis.toastr?.error(error.message); abort(true); }
    }
};

function renderState() {
    if (!root) return;
    const s = settings();
    root.querySelector('[data-depth-row]').hidden = s.position !== 'custom';
    root.querySelector('[data-badge]').textContent = s.enabled ? 'ON' : 'OFF';
    root.dataset.enabled = String(s.enabled && !suspended);
    const status = root.querySelector('[data-status]');
    delete status.dataset.error;
    status.textContent = suspended ? '확장이 비활성화되어 있어요.' : !s.enabled ? '꺼짐 · 저장한 지시문을 추가하지 않아요.'
        : !s.text.trim() ? '지시문을 입력하면 적용돼요.' : `켜짐 · 다음 답변부터 적용 · Depth ${depth(s)}`;
    root.querySelector('[data-count]').textContent = `${s.text.length.toLocaleString()}자`;
    root.querySelector('[data-preview]').textContent = s.enabled && s.text.trim()
        ? `[${['System', 'User', 'Assistant'][s.role]} · Depth ${depth(s)}]\n${s.text}` : '현재 추가할 지시문이 없어요.';
}

function populate() {
    if (!root) return;
    const s = settings();
    for (const el of root.querySelectorAll('[data-setting]')) {
        if (el.type === 'checkbox') el.checked = s[el.dataset.setting];
        else el.value = String(s[el.dataset.setting]);
    }
    refresh();
}

function mount() {
    const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!host || document.getElementById(ID)) return;
    root = document.createElement('div');
    root.id = ID;
    root.innerHTML = `
      <details class="gpt-panel" open>
        <summary><span>공통 프롬프트 토글</span><span data-badge>OFF</span></summary>
        <div class="gpt-body">
          <p class="gpt-muted">프리셋을 바꿔도, 한 번 저장한 지시문을 그대로.</p>
          <label class="gpt-toggle"><span>추가 지시문 적용</span><input type="checkbox" data-setting="enabled" role="switch" aria-label="추가 지시문 적용"></label>
          <label for="gpt-text">지시문</label>
          <textarea id="gpt-text" class="text_pole" data-setting="text" rows="8" placeholder="AI에게 추가로 전달할 지시문을 입력하세요."></textarea>
          <div class="gpt-meta"><span>변경사항 자동 저장</span><span data-count>0자</span></div>
          <label for="gpt-position">삽입 위치</label>
          <select id="gpt-position" class="text_pole" data-setting="position">
            <option value="after">마지막 메시지 뒤 (Depth 0)</option>
            <option value="before">마지막 메시지 앞 (Depth 1)</option>
            <option value="custom">직접 지정</option>
          </select>
          <div data-depth-row hidden><label for="gpt-depth">깊이 (Depth)</label><input id="gpt-depth" class="text_pole" type="number" min="0" max="10000" step="1" data-setting="depth"><p class="gpt-muted">0은 대화 끝, 1은 마지막 메시지 앞이에요. 숫자가 커질수록 과거 메시지 쪽에 들어가요.</p></div>
          <details class="gpt-advanced"><summary>고급 설정</summary>
            <label for="gpt-role">메시지 역할</label>
            <select id="gpt-role" class="text_pole" data-setting="role"><option value="0">System</option><option value="1">User</option><option value="2">Assistant</option></select>
            <label class="gpt-check"><input type="checkbox" data-setting="includeQuiet">백그라운드 생성(Quiet)에도 적용</label>
            <p class="gpt-muted">요약 등 백그라운드 작업에도 필요할 때만 켜세요. 일반 답변·재생성·스와이프·이어쓰기·사용자 대리 생성에는 적용해요.</p>
          </details>
          <p class="gpt-status" data-status role="status" aria-live="polite"></p>
          <details class="gpt-preview"><summary>추가 지시문 확인</summary><pre data-preview></pre></details>
          <p class="gpt-muted">위치는 대화 기록 기준이에요. 프리셋의 후반 지시문이 더 뒤에 올 수 있어요. OFF는 이전 답변이나 대화 기록을 지우지 않아요.</p>
        </div>
      </details>`;
    host.append(root);
    root.addEventListener('input', (event) => {
        const el = event.target;
        const key = el.dataset.setting;
        if (!key) return;
        const s = settings();
        s[key] = el.type === 'checkbox' ? el.checked : ['depth', 'role'].includes(key) ? Number(el.value) : el.value;
        settings();
        context().saveSettingsDebounced();
        refresh();
    });
    root.addEventListener('change', (event) => {
        if (event.target.dataset.setting === 'depth') event.target.value = String(settings().depth);
    });
    populate();
}

function boot() {
    try {
        const ctx = context();
        if (!wired) {
            wired = true;
            const on = (name, fn) => { if (ctx.eventTypes?.[name]) ctx.eventSource.on(ctx.eventTypes[name], fn); };
            on('APP_READY', () => { mount(); populate(); });
            on('CHAT_CHANGED', () => refresh());
            on('PRESET_CHANGED', () => refresh());
            on('SETTINGS_LOADED', () => { mount(); populate(); });
            // Includes dry runs, so prompt inspection/token counting sees the same injection.
            on('GENERATION_AFTER_COMMANDS', (type) => refresh(type));
        }
        mount();
        refresh();
    } catch (error) { report(error); }
}

export function onDisable() { suspended = true; clearPrompt(); renderState(); }
export function onEnable() { suspended = false; boot(); populate(); }

if (globalThis.jQuery) globalThis.jQuery(boot);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
