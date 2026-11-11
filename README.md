# Espelhar

Mostre a sua tela quando o app não permite. **Sem conta, sem instalação:** quem recebe o código assiste ao vivo, direto do navegador.

Alternativa para aplicativos que não têm espelhamento de tela (ou que removeram a opção): o anfitrião espelha a janela pelo navegador e envia um código de 6 caracteres para quem vai assistir.

## Como funciona

1. O anfitrião informa seu nome, clica em **Espelhar minha tela**, escolhe a janela, aba ou tela e recebe um **código**.
2. Quem vai assistir entra pelo código (ou pelo link) e passa a ver a tela em tempo real.
3. O vídeo vai **direto do anfitrião para quem assiste** (WebRTC peer-to-peer via [PeerJS](https://peerjs.com/)), sem servidor de mídia.

## Recursos

- Sala com código de 6 caracteres e link de convite (`?sala=CÓDIGO`); o código pode ser trocado depois por um escolhido ou aleatório (**Trocar código**)
- Proteção opcional da sala por senha (mínimo de 6 caracteres)
- Até 30 espectadores na mesma sala
- Qualidade da transmissão: 1080p a 30 fps ou 1080p a 60 fps
- Áudio da transmissão (da aba, do sistema ou da janela, conforme o que o navegador oferece), com botão de silenciar e controle de volume para quem assiste; é possível espelhar sem áudio
- Chat de texto na sala, pelo canal de dados P2P
- Lista de participantes com a cidade de cada pessoa (consulta por IP via ipgeolocation.io)
- Permissões: o anfitrião pode dar a qualquer participante a permissão de espelhar a própria tela ou torná-lo admin, que também remove pessoas, para a tela de outra pessoa e troca o código; só o anfitrião encerra a sala
- Criar a sala vazia e espelhar depois, parar e retomar a transmissão sem fechar a sala
- Aviso sonoro quando alguém entra
- Em celulares e tablets é possível entrar e assistir, mas não espelhar

### Controles da interface

| Onde | Controle | O que faz |
| --- | --- | --- |
| Início | Abas **Espelhar** / **Assistir** | Escolhe entre criar uma sala ou entrar em uma |
| Início | **Proteger com senha** | Exige senha para entrar na sala |
| Início | **Espelhar minha tela** / **Só criar a sala, espelhar depois** | Cria a sala com ou sem transmissão imediata |
| Início | **Entrar na sala** | Entra pelo código informado |
| Sala (anfitrião) | **Espelhar minha tela** / **Parar de espelhar** | Inicia ou interrompe a transmissão |
| Sala (anfitrião) | **Encerrar sala** | Fecha a sala para todos |
| Sala (anfitrião) | **Copiar link** / **Copiar código** | Copia o convite |
| Sala (anfitrião e admins) | **Trocar código** | Aplica um novo código ou gera um **Aleatório** |
| Sala (anfitrião) | **Qualidade** | Alterna entre 1080p·30 fps e 1080p·60 fps |
| Sala (anfitrião) | **Mostrar prévia mesmo assim** | Liga a prévia ao espelhar uma tela inteira (desligada por padrão para evitar o efeito espelho) |
| Sala (quem assiste) | **Ativar som** / **Silenciar** e controle de volume | Ajusta o áudio da transmissão |
| Sala (quem assiste) | **Sair** | Sai da sala |
| Participantes | Botões por pessoa | Permitir que espelhe, tornar admin, remover da sala |

O app não define atalhos de teclado próprios.

## Limitações

- Atrás de NAT restritivo a conexão pode falhar, a menos que um servidor TURN seja configurado (`VITE_TURN_*`). Se a conexão direta não se estabelece, o espectador tenta automaticamente uma conexão somente por relay.
- Sem backend próprio: a sinalização usa o servidor público do PeerJS.
- A qualidade real depende da velocidade de envio do anfitrião, dividida entre todos que assistem.
- Fechar a aba do anfitrião fecha a sala para todos.
- Cada navegador participa de uma sala por vez (uma aba só).

## Tecnologias

- [React](https://react.dev/) 19 + [Vite](https://vite.dev/)
- CSS puro
- [PeerJS](https://peerjs.com/) para WebRTC
- Fontes: Inter, Outfit e JetBrains Mono (via Fontsource)

## Variáveis de ambiente

Veja [`.env.example`](.env.example). Nunca commite o arquivo `.env`.

| Variável | Para que serve |
| --- | --- |
| `VITE_IPGEOLOCATION_KEY` | Chave da API ipgeolocation.io (consulta de cidade) |
| `VITE_SITE_URL` | URL pública do site, sem barra final (pré-visualização de links) |
| `VITE_TURN_URLS` | URL(s) do servidor TURN, separadas por vírgula |
| `VITE_TURN_USER` | Usuário do TURN |
| `VITE_TURN_PASS` | Senha do TURN |

## Estrutura

```
src/
  App.jsx        Alterna entre início, sala do anfitrião e sala de quem assiste
  components/    Telas e componentes (Home, HostRoom, ViewerRoom, Chat, Participants…)
  hooks/         useHost, useViewer e outros
  lib/           Captura de mídia, sala, presença, som
public/          Favicon e ícones
index.html       Página de entrada
vite.config.js   Configuração do Vite (CSP e URL do site)
```

## Licença

Projeto privado. Todos os direitos reservados.
