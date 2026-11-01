NEXO WEB PREMIUM V2 — expansão sobre a Etapa 1

INCLUÍDO
- Splash NEXO com arte original do APK e barra de progresso.
- Logo NEXO original e splash ícone instalável para iOS/Android.
- HOME: cards oficiais IA, Histórico, Filmes e Séries, Compartilhar.
- Navegação inferior: Início, Social, Chats, HAVE, Perfil.
- Chats, amigos e perfil: mantém o código Firebase da Etapa 1.
- Social: busca de perfis públicos, envio de convites, aceitar/recusar.
- Grupos NEXO: listar, criar com amigos, ler e enviar texto.
- Status: listar e publicar textos.
- HAVE: tela de catálogo com acesso à Nuvem NEXO e salas da própria conta.
- Histórico: lista de conversas no Firebase.
- PWA: ícones oficiais NEXO, instalação e cache visual.

DEPENDÊNCIAS E LIMITAÇÕES
- É necessário login Firebase e regras Firestore corretas (publicadas).
- A página web NÃO é uma cópia automática de Java/Android.
- IA no navegador: interface preparada; backend precisa de acesso autenticado.
- Nuvem NEXO: é domínio externo Base44; iframe pode ser bloqueado por CSP,
  nesses casos usar botão 'Abrir em outra guia'.
- Streaming externo depende de direitos/licenças, autenticação e CORS.
- Web Push iOS, mídia de chats, chamada, funcionalidades nativas, player de
  temporada, edição detalhada de perfil, HAVE salas síncronas ainda pendentes.
- Testar grupos/status, pois regras publicadas podem divergir das regras locais.
- Nenhuma API key administrativa, segredo do Render, token ou conta é incluído.
- firebase-config.js existente é preservado intacto.

Depois de instalar pelo Termux:
  cd ~/site-nexo
  git status --short
  git add -- app/
  git commit -m "Amplia NEXO Web Premium com splash e HOME completa"
  git push origin main

A instalação faz backup local em ~/storage/downloads/backup_nexo_web_v2_...
O site de downloads existente NÃO é modificado.
