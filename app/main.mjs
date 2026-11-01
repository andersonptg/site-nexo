import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, onSnapshot, query, where, orderBy,
  serverTimestamp, setDoc, addDoc, updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const state = {
  auth: null, db: null, user: null, profile: null,
  tab: 'messages', chats: [], friends: [], selectedPeer: null,
  profiles: new Map(), unsubs: [], chatUnsub: null, listRenderSeq: 0,
  sending: false
};

function toast(text, isError = true) {
  const target = $('loginMessage');
  target.textContent = text;
  target.style.color = isError ? '#ffb2a4' : '#6ee6b1';
}
function text(id, value) { $(id).textContent = String(value ?? ''); }
function clear(node) { node.replaceChildren(); }
function el(tag, cls, content) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (content !== undefined) node.textContent = String(content);
  return node;
}
function safePhoto(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return parsed.href;
  } catch (_) { /* foto ausente */ }
  return null;
}
function avatar(node, name, url) {
  clear(node);
  const photo = safePhoto(url);
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      clear(node);
      node.append(el('span', '', (name || 'N')[0].toUpperCase()));
    };
    node.append(img);
  } else {
    node.append(el('span', '', (name || 'N')[0].toUpperCase()));
  }
}
function getDisplayProfile(docData, id) {
  const d = docData || {};
  return {
    uid: id, name: d.nome || d.nomeExibicao || d.handle || 'Usuário NEXO',
    handle: d.handle || '', bio: d.descricao || 'Sem descrição',
    photo: d.fotoUrl || ''
  };
}
async function profileOf(uid) {
  if (!uid) return getDisplayProfile(null, '');
  if (state.profiles.has(uid)) return state.profiles.get(uid);
  const d = await getDoc(doc(state.db, 'perfis_publicos', uid));
  const info = getDisplayProfile(d.exists() ? d.data() : null, uid);
  state.profiles.set(uid, info);
  return info;
}
function dateTime(d) {
  try {
    const dt = d?.toDate?.();
    if (!dt) return '';
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(dt);
  } catch (_) { return ''; }
}
function theme() {
  try { return localStorage.getItem('nexo-web-theme') || 'dark'; }
  catch (_) { return 'dark'; }
}
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  $('themeButton').textContent = mode === 'dark' ? '☾' : '☀';
  try { localStorage.setItem('nexo-web-theme', mode); } catch (_) { /* sem storage */ }
}
setTheme(theme());
$('themeButton').addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));

function errorDescription(e) {
  const code = e?.code || '';
  if (code === 'auth/unauthorized-domain') return 'Autorize andersonptg.github.io nos domínios do Firebase Authentication.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'E-mail ou senha inválidos.';
  if (code === 'auth/too-many-requests') return 'Muitas tentativas. Tente novamente mais tarde.';
  if (code === 'permission-denied') return 'Permissão negada no Firestore. Verifique as regras publicadas.';
  if (code === 'unavailable') return 'Firebase indisponível ou sem conexão com a internet.';
  return `${e?.message || 'Não foi possível concluir a operação.'}`.slice(0, 180);
}

function resetListeners() {
  for (const fn of state.unsubs) try { fn(); } catch (_) {}
  state.unsubs = [];
  if (state.chatUnsub) try { state.chatUnsub(); } catch (_) {}
  state.chatUnsub = null;
  state.chats = []; state.friends = []; state.selectedPeer = null;
  state.profiles.clear();
}

function showLoggedOut() {
  resetListeners();
  state.user = null;
  $('loginView').hidden = false;
  $('appView').hidden = true;
  $('logoutButton').hidden = true;
  document.body.classList.remove('chat-open', 'profile-open');
}

async function showLoggedIn(user) {
  resetListeners();
  state.user = user;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('logoutButton').hidden = false;
  $('messageInput').value = '';
  state.tab = 'messages';
  state.profile = await profileOf(user.uid);
  if (state.user !== user) return;
  avatar($('myAvatar'), state.profile.name, state.profile.photo);
  text('myName', state.profile.name);
  text('myHandle', state.profile.handle ? `@${state.profile.handle.replace(/^@/, '')}` : user.email || 'NEXO');
  avatar($('profileAvatar'), state.profile.name, state.profile.photo);
  text('profileName', state.profile.name);
  text('profileHandle', state.profile.handle ? `@${state.profile.handle.replace(/^@/, '')}` : 'NEXO');
  text('profileBio', state.profile.bio);
  text('profileEmail', user.email || 'Conta autenticada');
  wireData(user.uid);
  switchTab('messages');
}

function wireData(uid) {
  const chatsQ = query(collection(state.db, 'chats'), where('participantes', 'array-contains', uid));
  const chUnsub = onSnapshot(chatsQ, snapshot => {
    state.chats = snapshot.docs.map(s => ({ id: s.id, ...s.data() }));
    if (state.tab === 'messages') renderList();
  }, e => renderListError('Não foi possível carregar conversas: ' + errorDescription(e)));
  state.unsubs.push(chUnsub);

  const friendsRef = collection(state.db, 'conexoes', uid, 'usuarios');
  const frUnsub = onSnapshot(friendsRef, snapshot => {
    state.friends = snapshot.docs
      .filter(d => d.data()?.tipo === 'amigo')
      .map(d => d.id);
    if (state.tab === 'friends') renderList();
  }, e => renderListError('Não foi possível carregar amigos: ' + errorDescription(e)));
  state.unsubs.push(frUnsub);
}

function renderListError(msg) {
  clear($('itemList'));
  $('itemList').append(el('p', 'empty', msg));
}
function otherUid(chat) {
  const members = Array.isArray(chat.participantes) ? chat.participantes : [];
  return members.find(uid => uid !== state.user.uid) || null;
}
async function renderList() {
  const seq = ++state.listRenderSeq;
  const list = $('itemList');
  clear(list);
  if (state.tab === 'profile') {
    text('listTitle', 'Minha conta');
    text('listCount', '');
    list.append(el('p', 'empty', 'Seu perfil está aberto.'));
    return;
  }
  const items = state.tab === 'friends'
    ? [...new Set(state.friends)].map(uid => ({ uid, chat: null }))
    : state.chats.map(chat => ({ uid: otherUid(chat), chat })).filter(it => it.uid);
  text('listTitle', state.tab === 'friends' ? 'Meus amigos' : 'Conversas');
  text('listCount', `${items.length}`);
  if (!items.length) {
    list.append(el('p', 'empty', state.tab === 'friends'
      ? 'Você ainda não possui conexões nesta conta.'
      : 'Nenhuma conversa encontrada. Abra a aba Amigos para iniciar uma.'));
    return;
  }
  for (const item of items) {
    if (seq !== state.listRenderSeq || !state.user) return;
    try {
      const p = await profileOf(item.uid);
      if (seq !== state.listRenderSeq || !state.user) return;
      const button = el('button', 'list-item');
      button.type = 'button';
      if (state.selectedPeer === item.uid) button.classList.add('selected');
      const img = el('span', 'avatar'); avatar(img, p.name, p.photo);
      const copy = el('span', 'item-copy');
      copy.append(el('strong', '', p.name));
      copy.append(el('small', '', p.handle ? `@${p.handle.replace(/^@/, '')}` : 'Toque para conversar'));
      button.append(img, copy);
      button.addEventListener('click', () => openConversation(item.uid));
      list.append(button);
    } catch (e) {
      if (seq !== state.listRenderSeq) return;
      const row = el('button', 'list-item', 'Conversa — toque para abrir');
      row.addEventListener('click', () => openConversation(item.uid));
      list.append(row);
    }
  }
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  if (tab === 'profile') {
    if (state.chatUnsub) { state.chatUnsub(); state.chatUnsub = null; }
    $('profile').hidden = false;
    $('chat').hidden = true;
    $('welcome').hidden = true;
    document.body.classList.remove('chat-open');
    document.body.classList.add('profile-open');
  } else {
    $('profile').hidden = true;
    document.body.classList.remove('profile-open');
    if (!state.selectedPeer) {
      $('chat').hidden = true;
      $('welcome').hidden = false;
      document.body.classList.remove('chat-open');
    } else {
      $('chat').hidden = false;
      $('welcome').hidden = true;
    }
  }
  renderList();
}
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.tab !== 'profile') {
      state.selectedPeer = null;
      if (state.chatUnsub) { state.chatUnsub(); state.chatUnsub = null; }
      document.body.classList.remove('chat-open');
    }
    switchTab(button.dataset.tab);
  });
});
$('backToList').addEventListener('click', () => {
  state.selectedPeer = null;
  document.body.classList.remove('chat-open');
  if (state.chatUnsub) { state.chatUnsub(); state.chatUnsub = null; }
  $('chat').hidden = true;
  $('welcome').hidden = false;
});

function chatId(a, b) { return [a, b].sort().join('_'); }
async function openConversation(peerUid) {
  if (!state.user || !peerUid || peerUid === state.user.uid) return;
  if (state.chatUnsub) { state.chatUnsub(); state.chatUnsub = null; }
  state.selectedPeer = peerUid;
  document.body.classList.add('chat-open');
  document.body.classList.remove('profile-open');
  $('profile').hidden = true;
  $('welcome').hidden = true;
  $('chat').hidden = false;
  renderList();
  const messages = $('messages');
  clear(messages);
  messages.append(el('p', 'empty', 'Carregando conversa...'));
  try {
    const p = await profileOf(peerUid);
    if (state.selectedPeer !== peerUid) return;
    text('chatName', p.name);
    text('chatHandle', p.handle ? `@${p.handle.replace(/^@/, '')}` : 'NEXO');
    avatar($('chatAvatar'), p.name, p.photo);
    const id = chatId(state.user.uid, peerUid);
    const ref = doc(state.db, 'chats', id);
    // Mesmo procedimento do Android: garante participantes da conversa com merge.
    await setDoc(ref, { participantes: [state.user.uid, peerUid].sort() }, { merge: true });
    if (state.selectedPeer !== peerUid) return;
    const messagesQ = query(collection(state.db, 'chats', id, 'mensagens'), orderBy('criadoEm', 'asc'));
    state.chatUnsub = onSnapshot(messagesQ, docs => {
      if (state.selectedPeer !== peerUid) return;
      clear(messages);
      if (docs.empty) messages.append(el('p', 'empty', 'Conversa iniciada. Envie sua primeira mensagem.'));
      docs.forEach(item => renderMessage(item.data()));
      messages.scrollTop = messages.scrollHeight;
    }, e => {
      clear(messages);
      messages.append(el('p', 'empty', errorDescription(e)));
    });
  } catch (e) {
    clear(messages);
    messages.append(el('p', 'empty', 'Erro ao abrir conversa: ' + errorDescription(e)));
  }
}
function renderMessage(data) {
  const mine = data.remetenteUid === state.user.uid;
  const row = el('div', `message-row ${mine ? 'mine' : 'other'}`);
  const bubble = el('div', 'bubble');
  if (data.respostaTexto) bubble.append(el('div', 'quote', data.respostaTexto));
  const type = data.tipo || 'texto';
  const content = type === 'texto' ? data.texto :
    type === 'audio' ? '🎤 Mensagem de áudio (reprodução web em desenvolvimento)' :
    type === 'imagem' ? '🖼️ Imagem (visualização web em desenvolvimento)' :
    `[${type}]`;
  bubble.append(el('div', '', content || ' '));
  bubble.append(el('small', 'msg-meta', dateTime(data.criadoEm)));
  row.append(bubble);
  $('messages').append(row);
}

$('messageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const peer = state.selectedPeer, user = state.user;
  const content = $('messageInput').value.trim();
  if (!peer || !user || !content || state.sending) return;
  state.sending = true;
  $('sendButton').disabled = true;
  const conversationId = chatId(user.uid, peer);
  const convoRef = doc(state.db, 'chats', conversationId);
  try {
    // Esse é o mesmo formato usado no Android (ChatIndividualActivity).
    await addDoc(collection(state.db, 'chats', conversationId, 'mensagens'), {
      remetenteUid: user.uid, destinatarioUid: peer, texto: content,
      tipo: 'texto', lida: false, criadoEm: serverTimestamp()
    });
    if (state.selectedPeer === peer) $('messageInput').value = '';
    try {
      await updateDoc(convoRef, { [`naoLidas_${peer}`]: increment(1) });
    } catch (countErr) { console.warn('Contador de não lidas:', countErr?.code || countErr); }
    // Nesta etapa NÃO duplicamos o mecanismo FCM do Android: notificações web serão integradas e testadas separadamente.
  } catch (err) {
    alert('Não foi possível enviar a mensagem: ' + errorDescription(err));
  } finally {
    state.sending = false;
    $('sendButton').disabled = false;
  }
});

$('logoutButton').addEventListener('click', async () => {
  if (state.auth) await signOut(state.auth);
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!state.auth) return toast('Configuração do Firebase Web pendente.');
  const email = $('email').value.trim();
  const password = $('password').value;
  $('loginButton').disabled = true;
  toast('Autenticando...', false);
  try { await signInWithEmailAndPassword(state.auth, email, password); toast('Login realizado.', false); }
  catch (err) { toast(errorDescription(err)); }
  finally { $('loginButton').disabled = false; }
});

if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) {
  toast('Firebase Web ainda não configurado. Execute o instalador no Termux e confira o arquivo firebase-config.js.');
  $('loginButton').disabled = true;
} else {
  try {
    const app = initializeApp(firebaseConfig);
    state.auth = getAuth(app);
    state.db = getFirestore(app);
    onAuthStateChanged(state.auth, user => {
      if (user) showLoggedIn(user).catch(err => {
        console.error('Falha de autenticação NEXO:', err);
        resetListeners();
        $('appView').hidden = true; $('loginView').hidden = false;
        toast('Não foi possível carregar o perfil: ' + errorDescription(err));
      });
      else showLoggedOut();
    });
  } catch (e) {
    toast('Erro ao configurar o Firebase: ' + errorDescription(e));
    $('loginButton').disabled = true;
  }
}
