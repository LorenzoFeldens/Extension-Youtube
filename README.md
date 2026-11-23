<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Ícone do Playlist Buttons for YouTube">
</p>

<h1 align="center">Playlist Buttons for YouTube</h1>

<p align="center">Botões de um clique nas miniaturas do YouTube que adicionam vídeos às suas playlists.</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/playlist-buttons-for-yout/abkipmhmjcdmoeofpmmomcpfaljnihao"><strong>Instalar pela Chrome Web Store</strong></a>
</p>

---

Extensão para o Google Chrome (Manifest V3) que coloca botões pequenos e coloridos em todas as miniaturas de
vídeo do YouTube. Cada botão é ligado a uma das suas playlists: clique nele e o vídeo é adicionado pela API
oficial do YouTube (YouTube Data API). Sem menus e sem a janela "Salvar na playlist".

## Funcionalidades

- **Botões em todas as miniaturas**: página inicial, inscrições, busca, páginas de canal, barra lateral da
  página do vídeo, playlists e Shorts. O vídeo que você está assistindo ganha os botões acima do título.
- **Quantos botões você quiser**, cada um com seu próprio nome, cor e playlist de destino.
- **Verificação de duplicados**: um vídeo que já está na playlist não é adicionado de novo.
- **Retorno claro**: o botão pulsa enquanto trabalha e depois mostra ✓ em caso de sucesso ou ! em caso de
  erro, junto com uma mensagem na tela.
- **Configurações salvas automaticamente**, aplicadas na hora às abas do YouTube abertas e sincronizadas
  entre os seus navegadores Chrome.
- **Botão liga/desliga** para esconder todos os botões sem perder a configuração.
- **Atalho de lixeira** nas suas páginas de playlist para remover um vídeo com um clique (YouTube em inglês e
  em português).

## Instalação

Instale pela [Chrome Web Store](https://chromewebstore.google.com/detail/playlist-buttons-for-yout/abkipmhmjcdmoeofpmmomcpfaljnihao)
e depois fixe a extensão na barra de ferramentas pelo menu de extensões do Chrome (ícone de quebra-cabeça).

## Como usar

1. Clique no ícone da extensão na barra de ferramentas.
2. Clique em **+ Add button** e defina:
   - um **nome** (ex.: `Música`);
   - uma **cor**;
   - o **ID da playlist**: abra a playlist no YouTube e copie a parte da URL depois de `list=` (normalmente
     começa com `PL`).
3. Navegue pelo YouTube. Clique em um botão em qualquer miniatura para adicionar aquele vídeo.

No primeiro clique, a extensão pede para você entrar com a sua conta Google e permitir o acesso à sua conta
do YouTube.

## Instalação para desenvolvimento

1. Clone o repositório.
2. Abra `chrome://extensions`, ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e
   selecione a pasta do projeto.

O login com o Google só funciona quando o ID da extensão corresponde ao cliente OAuth do `manifest.json`
(tipo **Chrome Extension** no Google Cloud). O cliente do manifest está registrado para o ID do item na
Chrome Web Store. Para testar o login em uma cópia sem compactação, adicione a chave pública do item
(Developer Dashboard → Package → *View public key*) como `"key"` no seu `manifest.json` local, para que a
cópia local tenha o mesmo ID. **Não faça commit nem envie o campo `key`**: o `package.ps1` se recusa a gerar o
pacote com ele.

## Empacotamento para a Chrome Web Store

```powershell
.\package.ps1
```

Gera `dist/playlist-buttons-for-youtube-<versão>.zip` só com os arquivos usados em tempo de execução.
Aumente o campo `version` do `manifest.json` antes de cada envio para a loja.

## Estrutura do projeto

| Arquivo | Função |
|---|---|
| `manifest.json` | Manifesto da extensão (permissões, cliente e escopo OAuth, ícones) |
| `background.js` | Service worker: login com o Google e chamadas à YouTube Data API |
| `contentScript.js` | Adiciona os botões às miniaturas do YouTube e o atalho de lixeira nas páginas de playlist |
| `styles.css` | Estilos dos botões, da sobreposição e das mensagens injetados no YouTube |
| `popup.html` / `popup.js` | Janela de configurações: lista de botões, salvamento automático e botão liga/desliga |
| `icons/` | Ícones da extensão (`icon.svg` é a arte original) |
| `docs/privacy-policy.md` | Política de privacidade, publicada pelo GitHub Pages |
| `package.ps1` | Gera o zip para a Web Store |

## Permissões

| Permissão | Motivo |
|---|---|
| `storage` | Salva a configuração dos botões (sincronizada entre os seus navegadores Chrome) |
| `identity` | Login com o Google para chamar a YouTube Data API |
| `youtube.com` | Mostra os botões nas páginas do YouTube |
| `googleapis.com` | Chama a YouTube Data API v3 |
| Escopo OAuth `youtube` | Necessário para adicionar itens às suas playlists |

## Cota da API

A YouTube Data API tem uma cota padrão de 10.000 unidades por dia por projeto do Google Cloud, compartilhada
por todos os usuários. Cada adição custa cerca de 51 unidades (50 para a inserção e 1 para a verificação de
duplicados), ou seja, umas 190 adições por dia no total.

## Privacidade

A extensão não tem servidores, não coleta dados de navegação e não tem anúncios nem analytics. O seu login é
usado só para chamar a YouTube Data API quando você clica em um botão. Leia a
[política de privacidade](https://lorenzofeldens.github.io/Extension-Youtube/privacy-policy) completa.

## Aviso

Esta extensão não é afiliada, endossada nem patrocinada pelo YouTube ou pela Google LLC. YouTube é uma marca
registrada da Google LLC.
