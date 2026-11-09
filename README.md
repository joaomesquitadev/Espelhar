# Espelhar

Mostre a sua tela quando o app não permite. **Sem conta, sem instalação:** quem recebe o código assiste ao vivo, direto do navegador.

Alternativa para aplicativos que não têm espelhamento de tela (ou que removeram a opção): o anfitrião espelha a janela pelo navegador e envia um código de 6 caracteres para quem vai assistir.

## Como funciona

1. O anfitrião clica em espelhar, escolhe a janela/tela e recebe um **código**.
2. Os visitantes entram pelo código (ou pelo link) e passam a ver a tela em tempo real.
3. O vídeo vai **direto do anfitrião para quem assiste** (WebRTC peer-to-peer via [PeerJS](https://peerjs.com/)), sem servidor de mídia.

### Recursos

- Vários espectadores na mesma sala
- Tela cheia
- Copiar código ou link
- Chat de texto na sala (via canal de dados P2P)
- Encerrar a transmissão a qualquer momento

### Limitações

- Atrás de NAT restritivo a conexão pode falhar, a menos que um servidor TURN seja configurado (`VITE_TURN_*`).
- Sem backend próprio: a sinalização usa o servidor público do PeerJS.

## Stack

- [React](https://react.dev/) 19 + [Vite](https://vite.dev/)
- CSS puro
- [PeerJS](https://peerjs.com/) para WebRTC
- Fontes: Inter, Outfit e JetBrains Mono (via Fontsource)

## Como rodar

Requer [Node.js](https://nodejs.org/) instalado.

```bash
npm install
cp .env.example .env   # opcional: preencha as variáveis
npm run dev
```

Outros comandos:

```bash
npm run build     # gera a versão de produção em dist/
npm run preview   # serve o build localmente
```

## Variáveis de ambiente

Veja [`.env.example`](.env.example). Nunca commite o arquivo `.env`.

| Variável | Para que serve |
| --- | --- |
| `VITE_IPGEOLOCATION_KEY` | Chave da API ipgeolocation.io (consulta de cidade) |
| `VITE_SITE_URL` | URL pública do site, sem barra final (pré-visualização de links) |
| `VITE_TURN_URLS` | URL(s) do servidor TURN |
| `VITE_TURN_USER` | Usuário do TURN |
| `VITE_TURN_PASS` | Senha do TURN |

## Estrutura

```
src/
  components/   Telas e componentes (Home, HostRoom, ViewerRoom, Chat…)
  hooks/        useHost, useViewer e outros
  lib/          Mídia, sala, presença, som
public/         Favicon e ícones
PRODUCT.md      Contexto e princípios do produto
```

## Licença

Projeto privado. Todos os direitos reservados.
