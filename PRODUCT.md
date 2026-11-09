# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, CSS puro. Definido pelo usuário. Sem backend: WebRTC peer-to-peer via PeerJS (sinalização pública).

## Users

Pessoas que precisam mostrar a tela a outra pessoa agora (reunião rápida, suporte, aula), sem instalar nada nem criar conta. [Inferido do pedido, não confirmado em entrevista.]

## Product Purpose

Alternativa para aplicativos que não têm espelhamento de tela, ou que removeram a opção: o usuário espelha a janela do app pelo navegador e envia o código.

Espelhar espelha a tela do navegador com um código de 6 caracteres. Sucesso: de abrir o site a ter alguém vendo a tela em menos de 10 segundos.

## Positioning

Sem conta, sem instalação, sem servidor de mídia: o vídeo vai direto do anfitrião para quem assiste.

## Capabilities and Constraints

- Anfitrião inicia espelhamento e recebe um código; visitantes entram pelo código.
- Vários espectadores, tela cheia, copiar código/link, encerrar.
- Chat de texto na sala (via canal de dados P2P, mensagens passam pelo anfitrião). Sem contas.
- Atrás de NAT restritivo a conexão pode falhar (sem servidor TURN próprio).

## Brand Commitments

Nome: Espelhar. Referência visual obrigatória: Linear (escuro, acento lime #e4f222, Inter). Idioma: português do Brasil.

## Evidence on Hand

Nenhum cliente, métrica ou depoimento. Não inventar.

## Product Principles

1. Um caminho principal por tela, uma ação primária.
2. Estados honestos: conectando, erro e fim da transmissão sempre explicados.
3. Zero configuração.
