import { KEY, PREFIX, normalize, newItem, itemDepth, planInjections } from './core.js';
const ctx = () => globalThis.SillyTavern.getContext();
let suspended = false, wired = false, dialog, menu, deleted;
function settings() {
    const c = ctx(), old = c.extensionSettings[KEY];
    const migration = old && !Array.isArray(old.items);
    c.extensionSettings[KEY] = normalize(old);
    if (migration) c.saveSettingsDebounced();
    return c.extensionSettings[KEY];
}
function clear() {
    const c = ctx();
    if (c.extensionPrompts) {
        for (const key of Object.keys(c.extensionPrompts)) if (key === KEY || key.startsWith(PREFIX)) delete c.extensionPrompts[key];
    }
}
function sync(type) {
    const c = ctx();
    if (typeof c.setExtensionPrompt !== 'function' || !c.extensionPrompts) throw new Error('실리태번 프롬프트 API를 찾을 수 없어요. 버전을 확인해 주세요.');
    clear();
    if (!suspended) for (const p of planInjections(settings(), type)) c.setExtensionPrompt(p.key,p.text,1,p.depth,false,p.role);
}
function report(error) {
    console.error('[프롬프트 토글]',error);
    if (dialog) dialog.querySelector('[data-status]').textContent = error.message;
    globalThis.toastr?.error(error.message);
}
function refresh(type) { try { sync(type); status(); } catch(e) { report(e); } }
function save() { ctx().saveSettingsDebounced(); refresh(); }
globalThis.stGlobalPromptToggleInterceptor = (_chat,_size,abort,type) => {
    try { sync(type); } catch(e) { report(e); if(settings().enabled && !suspended) abort(true); }
};
function status() {
    const s = settings(), count = s.items.filter(x => x.enabled && x.text.trim()).length;
    if (menu) menu.querySelector('span').textContent = `프롬프트 토글 · ${s.enabled && !suspended ? count : 0}개 적용`;
    if (!dialog) return;
    dialog.querySelector('[data-master]').checked = s.enabled;
    dialog.querySelector('[data-quiet]').checked = s.includeQuiet;
    dialog.querySelector('[data-status]').textContent = suspended ? '확장이 비활성화되어 있어요.' : s.enabled
        ? `${s.items.length}개 중 ${count}개 적용 · 변경사항 자동 저장` : `전체 적용 꺼짐 · 개별 ON/OFF 상태는 유지돼요`;
    dialog.querySelector('[data-undo]').hidden = !deleted;
    for (const card of dialog.querySelectorAll('[data-item-id]')) {
        const item = s.items.find(x => x.id === card.dataset.itemId);
        if (!item) continue;
        card.querySelector('[data-title]').textContent = item.title || '이름 없는 지시문';
        card.querySelector('[data-info]').textContent = `${item.enabled ? 'ON' : 'OFF'} · ${['System','User','Assistant'][item.role]} · Depth ${itemDepth(item)}`;
        card.querySelector('[data-depth-row]').hidden = item.position !== 'custom';
        card.dataset.enabled = String(item.enabled);
    }
}
function render(openId) {
    const s = settings(), list = dialog.querySelector('[data-list]');
    const opened = new Set([...list.querySelectorAll('details[open]')].map(x=>x.closest('[data-item-id]').dataset.itemId));
    list.replaceChildren();
    for (const [index,item] of s.items.entries()) {
        const card = document.createElement('article');
        card.dataset.itemId = item.id;
        card.innerHTML = `<div class="pt-card-head"><label class="pt-switch"><input type="checkbox" data-field="enabled" role="switch"><span>적용</span></label><div class="pt-actions"><button type="button" data-action="up" title="위로" aria-label="위로 이동">↑</button><button type="button" data-action="down" title="아래로" aria-label="아래로 이동">↓</button><button type="button" data-action="duplicate">복제</button><button type="button" data-action="delete">삭제</button></div></div>
        <details><summary><strong data-title></strong><small data-info></small></summary><div class="pt-fields">
        <label>이름<input class="text_pole" data-field="title" placeholder="예: 문체 / 묘사 / 출력 형식"></label>
        <label>지시문<textarea class="text_pole" data-field="text" rows="6" placeholder="AI에게 추가로 전달할 지시문을 입력하세요."></textarea></label>
        <div class="pt-columns"><label>삽입 위치<select class="text_pole" data-field="position"><option value="after">마지막 메시지 뒤 (0)</option><option value="before">마지막 메시지 앞 (1)</option><option value="custom">직접 지정</option></select></label>
        <label>역할<select class="text_pole" data-field="role"><option value="0">System</option><option value="1">User</option><option value="2">Assistant</option></select></label></div>
        <label data-depth-row>깊이 (Depth)<input class="text_pole" type="number" data-field="depth" min="0" max="10000" step="1"></label>
        </div></details>`;
        card.querySelector('details').open = opened.has(item.id) || item.id === openId || (!item.text && s.items.length === 1);
        for (const el of card.querySelectorAll('[data-field]')) {
            if (el.type === 'checkbox') { el.checked = item.enabled; el.setAttribute('aria-label',`${item.title || '지시문'} 적용`); }
            else el.value = String(item[el.dataset.field]);
        }
        card.querySelector('[data-action="up"]').disabled = index === 0;
        card.querySelector('[data-action="down"]').disabled = index === s.items.length - 1;
        list.append(card);
    }
    if (!s.items.length) { const empty=document.createElement('p');empty.textContent='아직 지시문이 없어요. + 지시문 추가를 눌러 시작하세요.';list.append(empty); }
    status();
}
function openManager() {
    if (suspended) return;
    if (!dialog) createDialog();
    render();
    if (!dialog.open) dialog.showModal();
}
function createDialog() {
    dialog=document.createElement('dialog'); dialog.id='st-prompt-manager';
    dialog.setAttribute('aria-labelledby','st-prompt-manager-title');
    dialog.innerHTML=`<header><div><h2 id="st-prompt-manager-title">프롬프트 토글</h2><p>자주 쓰는 지시문을 한곳에서 관리하세요.</p></div><button type="button" data-close aria-label="닫기">✕</button></header>
    <div class="pt-toolbar"><label class="pt-switch"><input type="checkbox" data-master role="switch">전체 적용</label><button type="button" data-add>+ 지시문 추가</button></div>
    <p class="pt-status" data-status role="status" aria-live="polite"></p><button type="button" data-undo hidden>방금 삭제한 지시문 복원</button>
    <main data-list></main><footer><details><summary>적용 설정 및 안내</summary><label class="pt-switch"><input type="checkbox" data-quiet>백그라운드 생성(Quiet)에도 적용</label><p>같은 위치·역할의 지시문은 목록 순서대로 합쳐서 전달해요. 다른 위치·역할의 최종 순서는 실리태번이 정해요.</p><p>Depth 0은 대화 기록 끝이에요. 프리셋의 후반 지시문이 더 뒤에 올 수 있어요. 빈 지시문은 제외하고, OFF는 이전 대화를 지우지 않아요.</p></details></footer>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>menu?.focus());
    dialog.querySelector('[data-add]').onclick=()=>{const s=settings(),item=newItem();s.items.push(item);save();render(item.id);dialog.querySelector(`[data-item-id="${CSS.escape(item.id)}"] input[data-field="title"]`).focus();};
    dialog.querySelector('[data-undo]').onclick=()=>{if(!deleted)return;const s=settings();s.items.splice(Math.min(deleted.index,s.items.length),0,deleted.item);const id=deleted.item.id;deleted=null;save();render(id);};
    dialog.addEventListener('input',event=>{
        const el=event.target, s=settings();
        if(el.hasAttribute('data-master')) s.enabled=el.checked;
        else if(el.hasAttribute('data-quiet')) s.includeQuiet=el.checked;
        else if(el.dataset.field) {
            const item=s.items.find(x=>x.id===el.closest('[data-item-id]').dataset.itemId);
            if(!item)return;
            item[el.dataset.field]=el.type==='checkbox'?el.checked:['depth','role'].includes(el.dataset.field)?Number(el.value):el.value;
        } else return;
        save();
    });
    dialog.addEventListener('change',event=>{if(event.target.dataset.field==='depth'){const item=settings().items.find(x=>x.id===event.target.closest('[data-item-id]').dataset.itemId);event.target.value=String(item.depth);}});
    dialog.addEventListener('click',event=>{
        const button=event.target.closest('[data-action]');if(!button)return;
        const s=settings(),id=button.closest('[data-item-id]').dataset.itemId,index=s.items.findIndex(x=>x.id===id);
        if(index<0)return;
        let openId;
        switch(button.dataset.action){
            case 'delete': deleted={item:s.items[index],index};s.items.splice(index,1);break;
            case 'duplicate': {const copy=newItem({...s.items[index],id:undefined,title:(s.items[index].title||'지시문')+' 복사',enabled:false});s.items.splice(index+1,0,copy);settings();openId=ctx().extensionSettings[KEY].items[index+1].id;break;}
            case 'up': if(index>0)[s.items[index-1],s.items[index]]=[s.items[index],s.items[index-1]];break;
            case 'down': if(index<s.items.length-1)[s.items[index+1],s.items[index]]=[s.items[index],s.items[index+1]];break;
        }
        save();render(openId);
    });
}
function mount(){
    const host=document.querySelector('#extensionsMenu');
    if(!host || document.getElementById('st-prompt-toggle-menu')) return;
    menu=document.createElement('div');menu.id='st-prompt-toggle-menu';menu.className='list-group-item flex-container flexGap5';menu.tabIndex=0;menu.setAttribute('role','button');
    menu.innerHTML='<i class="fa-solid fa-sliders" aria-hidden="true"></i><span>프롬프트 토글</span>';
    menu.onclick=openManager;
    menu.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openManager();}};
    host.append(menu);status();
}
function boot(){
    try {
        const c=ctx();
        if(!wired){wired=true;const on=(name,fn)=>{if(c.eventTypes?.[name])c.eventSource.on(c.eventTypes[name],fn);};
            for(const event of ['APP_READY','SETTINGS_LOADED'])on(event,()=>{mount();refresh();if(dialog?.open)render();});
            on('CHAT_CHANGED',()=>refresh());on('PRESET_CHANGED',()=>refresh());on('GENERATION_AFTER_COMMANDS',type=>refresh(type));
        }
        mount();refresh();
    }catch(e){report(e);}
}
export function onDisable(){suspended=true;clear();dialog?.close();if(menu)menu.hidden=true;}
export function onEnable(){suspended=false;boot();if(menu)menu.hidden=false;}
if(globalThis.jQuery)globalThis.jQuery(boot);
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
