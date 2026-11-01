/* NEXO Web Premium V2 — expansão das telas Android sem substituir a etapa 1.
   Usa apenas Firebase SDK cliente; regras Firestore continuam sendo a autorização real. */
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, onSnapshot, query, where, limit,
  orderBy, setDoc, updateDoc, addDoc, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const cache = new Map();
const subscriptions = [];
const socialSubscriptions = [];
let user = null;
let selectedGroup = null;
let selectedScreen = 'home';
let selectedSocial = 'global';
let changing = 0;
let groupStream = null;
let currentGroups = [];
let friends = [];
let toastTimer;
const CATALOG_URL = 'https://nippy-nexo-stream-hub.base44.app/';
const HOME_URL = 'https://andersonptg.github.io/site-nexo/';

const create = (tag, className = '', value) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (value !== undefined) e.textContent = String(value);
  return e;
};
function notify(message) {
  const box = $('nexoToast'); if (!box) return;
  box.textContent = String(message); box.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.hidden = true, 4200);
}
function errorMessage(e) {
  console.warn('NEXO Web:', e);
  if (e?.code === 'permission-denied') return 'O Firestore recusou este acesso. Precisamos conferir as regras publicadas.';
  if (e?.code === 'failed-precondition') return 'Esta consulta precisa de um índice no Firestore.';
  return String(e?.message || 'Não foi possível concluir a ação.').slice(0,170);
}
function clean(node) { node.replaceChildren(); }
function text(node, value) { node.append(create('span','',value)); }
function makeButton(label, callback, className='exp-secondary') {
  const button = create('button', className, label);
  button.type = 'button'; button.addEventListener('click', callback); return button;
}
function timeStamp(v) {
  try { return v?.toMillis?.() ?? (typeof v === 'number' ? v : 0); } catch { return 0; }
}
function dateFmt(v) {
  const ms = timeStamp(v); if (!ms) return '';
  return new Date(ms).toLocaleString('pt-BR', {dateStyle:'short',timeStyle:'short'});
}
function safeImage(url) {
  try { const u = new URL(String(url)); return u.protocol === 'https:' ? u.href : ''; }
  catch { return ''; }
}
function avatar(name, url) {
  const a = create('span','exp-avatar');
  const photo = safeImage(url);
  if (photo) {
    const img = create('img'); img.src=photo; img.alt=''; img.loading='lazy';
    img.onerror=()=>{clean(a);a.textContent=(name||'N').charAt(0).toUpperCase();};a.append(img);
  } else a.textContent=(name||'N').charAt(0).toUpperCase();
  return a;
}
async function profile(uid) {
  if (cache.has(uid)) return cache.get(uid);
  try {
    const d = await getDoc(doc(db,'perfis_publicos',uid));
    const obj = d.exists() ? d.data() : {};
    const value={uid,name:obj.nome||obj.nomeExibicao||obj.handle||'Usuário NEXO',handle:obj.handle||'',photo:obj.fotoUrl||'',bio:obj.descricao||''};
    cache.set(uid,value);return value;
  } catch { return {uid,name:'Usuário NEXO',handle:'',photo:'',bio:''}; }
}
function cleanup() {
  for(const stop of subscriptions.splice(0))try{stop();}catch{}
  for(const stop of socialSubscriptions.splice(0))try{stop();}catch{}
  if(groupStream){groupStream();groupStream=null;}
  selectedGroup=null;currentGroups=[];friends=[];cache.clear();
}

const splash = $('nexoSplash');
const closeSplash = () => splash?.classList.add('splash-done');
setTimeout(closeSplash, 2300);
$('skipSplash')?.addEventListener('click', closeSplash);
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(closeSplash,350);

function nav(screen) {
  const view = $('appView');
  if(!user){notify('Entre no NEXO para acessar esta área.');return;}
  selectedScreen=screen;
  const legacy = ['messages','friends','profile'].includes(screen);
  view.dataset.mode = legacy ? 'legacy' : 'expanded';
  $('nexoExpansion').hidden=legacy;
  document.querySelectorAll('.nexo-dock [data-screen]').forEach(b=>b.classList.toggle('active', b.dataset.screen===screen || (['friends','groups','requests','status'].includes(screen) && b.dataset.screen==='social')));
  if (legacy) {
    const tab = document.querySelector(`.tab-navigation [data-tab="${screen}"]`);
    tab?.click();
  } else {
    const panel = ['social','requests','groups','status'].includes(screen) ? 'Social' : ({home:'Home',have:'Have',ia:'IA',history:'History',share:'Share'}[screen]||'Home');
    document.querySelectorAll('.exp-panel').forEach(section=>section.hidden=section.id!==`screen${panel}`);
    document.body.classList.remove('chat-open','profile-open');
    if (panel==='Social') {
      selectSocial(screen==='social'?'global':screen);
    } else if(panel==='History') showHistory();
  }
  window.scrollTo({top:0,behavior:'instant'});
}
function selectSocial(tab) {
  if(tab==='friends'){nav('friends');return;}
  selectedSocial=tab;
  for(const stop of socialSubscriptions.splice(0))try{stop();}catch{}
  if(groupStream){groupStream();groupStream=null;}
  selectedGroup=null;
  document.querySelectorAll('[data-social]').forEach(b=>b.classList.toggle('active',b.dataset.social===tab));
  const box=$('socialContent');clean(box);box.append(create('p','exp-loading','Carregando…'));
  const seq=++changing;
  if(tab==='global')showGlobal(box,seq);
  if(tab==='requests')showRequests(box,seq);
  if(tab==='groups')showGroups(box,seq);
  if(tab==='status')showStatus(box,seq);
}
function still(seq,tab){return seq===changing && user && selectedSocial===tab && ['social','groups','requests','status'].includes(selectedScreen);}

async function showGlobal(box,seq) {
  try {
    const snap=await getDocs(query(collection(db,'perfis_publicos'),limit(70)));
    if(!still(seq,'global'))return;
    clean(box);
    const title=create('div','exp-list-head');title.append(create('h2','', 'Pessoas no GLOBAL'));
    const search=create('input','exp-search');search.placeholder='Pesquisar por nome ou @usuário';search.type='search';search.setAttribute('aria-label','Pesquisar pessoas');title.append(search);box.append(title);
    const results=create('div','exp-list');box.append(results);
    const all=snap.docs.filter(d=>d.id!==user.uid).map(d=>({uid:d.id, ...d.data()}));
    const draw=()=>{
      clean(results);const term=search.value.trim().toLowerCase();
      const filtered=all.filter(p=>(`${p.nome||p.nomeExibicao||''} ${p.handle||''}`).toLowerCase().includes(term));
      if(!filtered.length){results.append(create('p','exp-empty','Nenhum perfil encontrado.'));return;}
      filtered.forEach(p=>{
        const name=p.nome||p.nomeExibicao||p.handle||'Usuário NEXO';
        const row=create('div','exp-person');row.append(avatar(name,p.fotoUrl));
        const info=create('div','exp-person-copy');info.append(create('strong','',name));info.append(create('small','',p.handle?`@${String(p.handle).replace(/^@/,'')}`:'Perfil NEXO'));
        row.append(info);row.append(makeButton('ADICIONAR',()=>sendInvite(p.uid),'exp-small-btn'));results.append(row);
      });
    };search.addEventListener('input',draw);draw();
  } catch(e) {if(still(seq,'global')){clean(box);box.append(create('p','exp-empty',errorMessage(e)));}}
}
async function sendInvite(dest) {
  if(!user||dest===user.uid)return;
  try {
    await setDoc(doc(db,'convites',dest,'recebidos',user.uid),{
      uidRemetente:user.uid,uidDestino:dest,status:'pendente',criadoEm:serverTimestamp()
    },{merge:true});notify('Solicitação de amizade enviada.');
  } catch(e){notify('Convite não enviado: '+errorMessage(e));}
}
function showRequests(box,seq) {
  const ref=query(collection(db,'convites',user.uid,'recebidos'),where('status','==','pendente'));
  const stop=onSnapshot(ref,async snap=>{
    if(!still(seq,'requests'))return;
    clean(box);box.append(create('h2','exp-title','Solicitações recebidas'));
    if(snap.empty){box.append(create('p','exp-empty','Você não possui solicitações pendentes.'));return;}
    for(const d of snap.docs){
      if(!still(seq,'requests'))return;
      const p=await profile(d.id);if(!still(seq,'requests'))return;
      const row=create('div','exp-person');row.append(avatar(p.name,p.photo));
      const info=create('div','exp-person-copy');info.append(create('strong','',p.name));info.append(create('small','',`@${p.handle||'nexo'}`));row.append(info);
      const buttons=create('div','request-actions');buttons.append(makeButton('ACEITAR',()=>respondInvite(d.id,true),'exp-small-btn'));buttons.append(makeButton('RECUSAR',()=>respondInvite(d.id,false),'exp-small-btn ghost'));row.append(buttons);box.append(row);
    }
  },e=>{if(still(seq,'requests')){clean(box);box.append(create('p','exp-empty',errorMessage(e)));}});
  socialSubscriptions.push(stop);
}
async function respondInvite(peer,accept) {
  if(!user)return;
  try{
    const batch=writeBatch(db);
    const invite=doc(db,'convites',user.uid,'recebidos',peer);
    batch.update(invite,{status:accept?'aceito':'recusado'});
    if(accept){
      batch.set(doc(db,'conexoes',user.uid,'usuarios',peer),{uid:peer,tipo:'amigo',criadoEm:serverTimestamp()},{merge:true});
      batch.set(doc(db,'conexoes',peer,'usuarios',user.uid),{uid:user.uid,tipo:'amigo',criadoEm:serverTimestamp()},{merge:true});
    }
    await batch.commit(); notify(accept?'Amizade aceita!':'Solicitação recusada.');
  }catch(e){notify('Não foi possível responder: '+errorMessage(e));}
}
function showGroups(box,seq) {
  clean(box);
  const bar=create('div','exp-list-head');bar.append(create('h2','','Meus grupos'));
  bar.append(makeButton('＋ CRIAR GRUPO',()=>openGroupCreator(box,seq),'exp-small-btn'));
  box.append(bar);
  const list=create('div','exp-list');box.append(list);
  const q=query(collection(db,'grupos'),where('participantes','array-contains',user.uid));
  const stop=onSnapshot(q,snap=>{
    currentGroups=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!still(seq,'groups')||selectedGroup)return;
    clean(list);
    const socialGroups=currentGroups.filter(g=>g.tipo!=='HAVE'&&!g.servicoHave);
    if(!socialGroups.length){list.append(create('p','exp-empty','Nenhum grupo social ainda. Crie um para conversar com seus amigos.'));return;}
    socialGroups.forEach(g=>{
      const row=create('button','exp-person exp-tap');row.type='button';row.append(avatar(g.nome||'G',g.fotoUrl));
      const info=create('div','exp-person-copy');info.append(create('strong','',g.nome||'Grupo NEXO'));info.append(create('small','',`${(g.participantes||[]).length} membros · ${g.descricao||'Toque para conversar'}`));row.append(info);
      row.append(create('span','exp-chevron','›'));row.addEventListener('click',()=>openGroup(g,box,seq));list.append(row);
    });
  },e=>{if(still(seq,'groups')){clean(list);list.append(create('p','exp-empty',errorMessage(e)));}});
  socialSubscriptions.push(stop);
}
async function openGroupCreator(box,seq){
  selectedGroup='creator';clean(box);
  const back=makeButton('← VOLTAR',()=>{selectedGroup=null;selectSocial('groups');});box.append(back);
  box.append(create('h2','exp-title','Criar grupo NEXO'));
  const form=create('form','exp-form');
  const label=create('label','','Nome do grupo');const name=create('input');name.type='text';name.maxLength=55;name.required=true;name.placeholder='Ex.: Amigos NEXO';label.append(name);form.append(label);
  const descLabel=create('label','','Descrição (opcional)');const desc=create('textarea');desc.maxLength=160;desc.rows=2;descLabel.append(desc);form.append(descLabel);
  const matesLabel=create('div','exp-hint','Convidar amigos para o grupo:');form.append(matesLabel);
  const mates=create('div','friends-checks');form.append(mates);
  try {
    const docs=await getDocs(collection(db,'conexoes',user.uid,'usuarios'));
    if(still(seq,'groups')&&selectedGroup==='creator'){
      const ids=docs.docs.filter(d=>d.data()?.tipo==='amigo').map(d=>d.id);
      if(!ids.length)mates.append(create('p','exp-hint','Você poderá compartilhar este grupo quando tiver amigos.'));
      for(const uid of ids){const p=await profile(uid);if(selectedGroup!=='creator')break;
        const l=create('label','check-friend');const c=create('input');c.type='checkbox';c.value=uid;l.append(c,document.createTextNode(' '+p.name));mates.append(l);}
    }
  }catch(e){mates.append(create('p','exp-hint','Amigos indisponíveis: '+errorMessage(e)));}
  const submit=create('button','exp-primary','CRIAR GRUPO');submit.type='submit';form.append(submit);
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(!user)return;
    submit.disabled=true;
    try{
      const members=[user.uid,...[...mates.querySelectorAll('input:checked')].map(e=>e.value)];
      const docRef=await addDoc(collection(db,'grupos'),{
        nome:name.value.trim(),descricao:desc.value.trim(),fotoUrl:'',administradorUid:user.uid,
        participantes:[...new Set(members)],criadoEm:serverTimestamp()
      });
      notify('Grupo criado!');selectedGroup=null;selectSocial('groups');
    }catch(e){notify('Não foi possível criar: '+errorMessage(e));submit.disabled=false;}
  });box.append(form);
}
function openGroup(g,box,seq){
  selectedGroup=g.id;
  clean(box);
  const back=makeButton('← MEUS GRUPOS',()=>{if(groupStream){groupStream();groupStream=null;}selectedGroup=null;selectSocial('groups');});box.append(back);
  const heading=create('div','exp-page-head');const title=create('h2','',g.nome||'Grupo NEXO');heading.append(title,create('p','exp-hint',`${(g.participantes||[]).length} participantes`));box.append(heading);
  const messages=create('div','group-messages');messages.append(create('p','exp-empty','Carregando mensagens…'));box.append(messages);
  const form=create('form','group-form');const input=create('input');input.type='text';input.maxLength=4000;input.required=true;input.placeholder='Mensagem para o grupo…';input.setAttribute('aria-label','Mensagem para o grupo');const send=create('button','exp-primary','ENVIAR');send.type='submit';form.append(input,send);box.append(form);
  if(groupStream){groupStream();groupStream=null;}
  groupStream=onSnapshot(query(collection(db,'grupos',g.id,'mensagens'),orderBy('criadoEm','asc'),limit(150)),async snap=>{
    if(!still(seq,'groups')||selectedGroup!==g.id)return;
    clean(messages);
    if(snap.empty){messages.append(create('p','exp-empty','Comece a conversa do grupo.'));return;}
    snap.docs.forEach(d=>{
      const v=d.data();if((v.apagadoPara||[]).includes(user.uid))return;
      const mine=(v.autorUid||v.remetenteUid)===user.uid;
      const row=create('div','group-message '+(mine?'mine':''));
      row.append(create('span','group-msg-label',mine?'Você':'Membro do grupo'));
      row.append(create('p','',v.tipo==='texto'||!v.tipo?(v.texto||' '):'📎 Mídia do grupo (versão web em desenvolvimento)'));
      row.append(create('small','',dateFmt(v.criadoEm)));messages.append(row);
    });messages.scrollTop=messages.scrollHeight;
  },e=>{clean(messages);messages.append(create('p','exp-empty',errorMessage(e)));});
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();const str=input.value.trim();if(!str||!user)return;
    send.disabled=true;
    try{
      await addDoc(collection(db,'grupos',g.id,'mensagens'),{
        autorUid:user.uid,remetenteUid:user.uid,texto:str,tipo:'texto',criadoEm:serverTimestamp()
      });input.value='';
    }catch(e){notify('Mensagem não enviada: '+errorMessage(e));}
    finally{send.disabled=false;}
  });
}
function showStatus(box,seq){
  clean(box);
  box.append(create('h2','exp-title','Status NEXO'));
  const form=create('form','exp-form status-form');const field=create('textarea');field.required=true;field.maxLength=300;field.rows=2;field.placeholder='O que você quer compartilhar hoje?';field.setAttribute('aria-label','Novo status');
  const send=create('button','exp-primary','PUBLICAR STATUS');send.type='submit';form.append(field,send);box.append(form);
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(!user)return;send.disabled=true;
    try{
      await addDoc(collection(db,'status'),{
        uid:user.uid,autorUid:user.uid,tipo:'mensagem',texto:field.value.trim(),midiaUrl:'',fundo:'',fonte:'padrao',visualizadores:{},expiraEm:Date.now()+86400000,criadoEm:serverTimestamp()
      });field.value='';notify('Status publicado.');
    }catch(e){notify('Status não publicado: '+errorMessage(e));}
    finally{send.disabled=false;}
  });
  const list=create('div','exp-list');box.append(list);
  const stop=onSnapshot(query(collection(db,'status'),limit(80)), async snap=>{
    if(!still(seq,'status'))return;
    clean(list);
    const entries=snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>!s.expiraEm||s.expiraEm>Date.now()).sort((a,b)=>timeStamp(b.criadoEm)-timeStamp(a.criadoEm));
    if(!entries.length){list.append(create('p','exp-empty','Ninguém publicou um status ainda.'));return;}
    for(const item of entries){
      if(!still(seq,'status'))return;
      const uid=item.autorUid||item.uid||'';const p=await profile(uid);if(!still(seq,'status'))return;
      const card=create('article','status-card');const head=create('div','status-heading');head.append(avatar(p.name,p.photo));const nm=create('div','exp-person-copy');nm.append(create('strong','',p.name));nm.append(create('small','',dateFmt(item.criadoEm)));head.append(nm);card.append(head);
      card.append(create('p','',item.texto||'Status de mídia (em desenvolvimento)'));list.append(card);
    }
  },e=>{if(still(seq,'status')){clean(list);list.append(create('p','exp-empty',errorMessage(e)));}});
  socialSubscriptions.push(stop);
}
async function showHistory(){
  const box=$('historyContent');if(!user||!box)return;
  clean(box);box.append(create('p','exp-loading','Buscando conversas…'));
  try {
    const snap=await getDocs(query(collection(db,'chats'),where('participantes','array-contains',user.uid),limit(50)));
    if(selectedScreen!=='history')return;
    clean(box);if(snap.empty){box.append(create('p','exp-empty','Ainda não há conversas nesta conta.'));return;}
    for(const item of snap.docs){
      if(selectedScreen!=='history')return;
      const peer=(item.data().participantes||[]).find(id=>id!==user.uid);
      if(!peer)continue;const p=await profile(peer);
      const row=create('button','exp-person exp-tap');row.type='button';row.append(avatar(p.name,p.photo));
      const info=create('div','exp-person-copy');info.append(create('strong','',p.name));info.append(create('small','','Abrir minhas conversas'));row.append(info,create('span','exp-chevron','›'));
      row.addEventListener('click',()=>nav('messages'));box.append(row);
    }
  }catch(e){clean(box);box.append(create('p','exp-empty',errorMessage(e)));}
}

function setupHave() {
  const selectors=[...document.querySelectorAll('[data-have-filter]')];
  selectors.forEach(btn=>btn.addEventListener('click',()=>{
    selectors.forEach(el=>el.classList.toggle('selected',el===btn));
    const title=$('haveContent');
    if(btn.dataset.haveFilter==='salas'){
      title.hidden=true;$('catalogWrap').hidden=true;showHaveRooms();
    }else{
      title.hidden=false;$('haveRooms')?.remove();
      const feature=title.querySelector('.have-feature-overlay h2');
      feature.textContent=btn.dataset.haveFilter==='series'?'Séries e temporadas na sua tela.':'Filmes e novidades na sua tela.';
    }
  }));
  $('openNexoCatalog')?.addEventListener('click',()=>{
    $('catalogWrap').hidden=false;
    $('nexoCatalogFrame').src=CATALOG_URL;
    $('catalogWrap').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('closeNexoCatalog')?.addEventListener('click',()=>{ $('catalogWrap').hidden=true;$('nexoCatalogFrame').src='about:blank';});
}
async function showHaveRooms(){
  const panel=$('screenHave');let box=$('haveRooms');if(!box){box=create('div','exp-list');box.id='haveRooms';panel.insertBefore(box,$('catalogWrap'));}
  clean(box);box.append(create('p','exp-loading','Carregando minhas salas HAVE…'));
  if(!user)return;
  try{
    const snap=await getDocs(query(collection(db,'grupos'),where('participantes','array-contains',user.uid),limit(60)));
    clean(box);
    const salas=snap.docs.filter(d=>d.data().tipo==='HAVE'||d.data().servicoHave);
    if(!salas.length){box.append(create('p','exp-empty','Nenhuma sala HAVE encontrada na sua conta. O recurso de assistir junto exige adaptação web.'));return;}
    salas.forEach(d=>{
      const v=d.data();const item=create('div','exp-person');item.append(create('span','exp-avatar','▶'));
      const info=create('div','exp-person-copy');info.append(create('strong','',v.nome||'Sala HAVE'));info.append(create('small','',v.servicoHave||'HAVE'));item.append(info);box.append(item);
    });
  }catch(e){clean(box);box.append(create('p','exp-empty',errorMessage(e)));}
}
function setupShare(){
  $('shareAppButton')?.addEventListener('click',async()=>{
    try{if(navigator.share)await navigator.share({title:'NEXO',text:'Conheça o NEXO',url:HOME_URL});else await navigator.clipboard.writeText(HOME_URL);notify('Link compartilhado ou copiado.');}
    catch(e){if(e.name!=='AbortError')notify('Compartilhamento indisponível.');}
  });
  $('copyAppButton')?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(HOME_URL);notify('Link copiado!');}
    catch{notify('Copie o endereço: '+HOME_URL);}
  });
}

document.querySelectorAll('[data-screen]').forEach(button=>button.addEventListener('click',()=>nav(button.dataset.screen)));
document.querySelectorAll('[data-social]').forEach(button=>button.addEventListener('click',()=>selectSocial(button.dataset.social)));
setupHave();setupShare();

onAuthStateChanged(auth, async nextUser=>{
  cleanup();user=nextUser;
  if(nextUser) nav('home');
  else {$('nexoExpansion').hidden=true;$('appView').dataset.mode='legacy';}
});
