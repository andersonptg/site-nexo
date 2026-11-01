NEXO WEB PREMIUM — ETAPA 1 (MVP)

Funciona, após configuração Firebase:
- Login com e-mail/senha da mesma conta Android;
- Leitura do perfil publico do usuario;
- Lista de conexoes e conversas existentes no Firestore;
- Conversas em tempo real e envio de texto aos mesmos chats Android;
- Adaptacao responsiva e modo claro/escuro local;
- Manifest e service worker para instalar no iPhone via Safari.

Nao implementado nesta etapa:
- Login por nome/telefone, novo cadastro;
- Push de mensagens enviadas via web, Web Push iPhone;
- Envio de audio/fotos, grupos e status;
- HAVE, filmes, ADM e funcoes nativas Android.

Firebase:
- O instalador tenta obter apenas os parametros publicos do arquivo local
  ~/da_nike_ai/app/google-services.json (se existir) e cria firebase-config.js.
- O ideal e cadastrar o aplicativo WEB no mesmo projeto da-nike-films e
  configurar as opcoes exibidas no Console Firebase (Web App).
- No Firebase Authentication > Settings > Authorized domains, adicione
  andersonptg.github.io, se ainda nao estiver autorizado.
- A chave da configuracao cliente nao e chave privada. Nunca publicar
  Service Account JSON, Admin SDK, segredo Render ou tokens de deploy.

Instalacao:
1. Execute o script unico instalar_nexo_web_etapa1.py no Termux.
2. Veja os arquivos em ~/site-nexo/app/.
3. Confirme que o Firebase Console permite esse dominio.
4. Comite SOMENTE o projeto ~/site-nexo e envie ao Github.
5. Abra https://andersonptg.github.io/site-nexo/app/
6. No iPhone Safari: Compartilhar > Adicionar à Tela de Inicio > Abrir como App da Web.

Observacao: o site atual de releases da raiz e o app Android permanecem intactos.
