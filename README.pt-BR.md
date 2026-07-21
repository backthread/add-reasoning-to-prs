[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Português** · [Русский](README.ru.md)

<div align="center">

# add-reasoning-to-prs

**PRs que se documentam sozinhos.** Um hook do [Claude Code](https://docs.claude.com/en/docs/claude-code) que escreve o *porquê* — decisões, trade-offs, premissas, limitações — em cada pull request, automaticamente. Redigido pelo seu próprio agente, na sua própria máquina.

[![npm](https://img.shields.io/npm/v/add-reasoning-to-prs.svg)](https://www.npmjs.com/package/add-reasoning-to-prs)
[![CI](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml/badge.svg)](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8A63D2.svg)](https://docs.claude.com/en/docs/claude-code)

![Antes e depois: um PR intitulado «update auth flow» com a descrição vazia, ao lado do mesmo PR com um bloco gerado de Decisões / Trade-offs / Premissas / Limitações.](assets/demo.gif)

</div>

> As traduções são um esforço colaborativo da comunidade e podem ficar defasadas. A versão em inglês ([README.md](README.md)) é a fonte autoritativa.

A IA escreve seu código. Ninguém escreve o *porquê*. Três semanas depois, seu histórico do
Git é uma pilha de decisões que tecnicamente são suas, mas que você nunca tomou de fato —
o diff diz *o que* mudou, o `git blame` diz *quem*, e o raciocínio simplesmente…
desapareceu.

Este é um hook que conserta isso na origem: bem antes de o seu agente abrir um PR (ou
fazer um commit direto na sua branch padrão), ele escreve um breve **bloco do «porquê»**
— as decisões que tomou, os trade-offs que pesou, o que assumiu e o que deixou de fora
conscientemente — direto na descrição. A partir da sessão real. Não do diff.

## Instalação

Um único comando:

```sh
npx add-reasoning-to-prs
```

Isso copia o hook autocontido e sem dependências para um local estável e o registra nas
configurações do seu Claude Code (`~/.claude/settings.json`) como um hook `PreToolUse`. Sem
etapa de build, sem conta, sem configuração.

Ou instale o **plugin do Claude Code** pelo marketplace (recomendado — ele registra o hook
a partir do manifesto do plugin e se atualiza junto com ele, sem mexer nas configurações do
seu projeto).

> **Requisitos:** Claude Code e Node.js ≥ 22.18. Apenas Claude Code, por enquanto — Cursor
> e Codex são os próximos.

## O que ele faz

| | |
|---|---|
| **Bloco do «porquê» automático na criação do PR** | Quando o seu agente roda `gh pr create` (ou faz um commit na sua branch padrão) sem um, o hook pede que ele escreva o bloco primeiro e depois rode o comando de novo. Zero passos manuais depois de instalado. |
| **Só para frente — nunca repete o diff** | Ele captura o que um diff *não pode* mostrar: o raciocínio e os riscos assumidos conscientemente. Começa pelo único ponto que um revisor não conseguiria tirar do código, e nunca enche linguiça com «refatorei X, melhorei Y». |
| **Local, com a sua própria assinatura, sem conta** | O bloco é redigido pelo seu próprio agente, dentro da sessão. Sem ida e volta ao servidor, nada é armazenado, e o seu código nunca sai da sua máquina. |
| **Nunca inventa** | Toda linha precisa remontar a uma decisão real da sessão. Se o agente não deliberou de verdade, nenhum bloco é adicionado — um bloco vazio é a resposta certa para uma mudança rotineira. |

## O que ele **não** faz

- **Não é um bot de revisão.** Ele não dá nota ao seu código, não pontua o seu PR nem barra um merge. Ele fica *acima do diff*, ao lado da revisão — acrescenta contexto, não julga.
- **Não é um diagrama, wiki ou grafo de conhecimento.** Nada para navegar, nada para manter sincronizado. Só o porquê, escrito onde os revisores já olham: a descrição do PR.
- **Não lê nem envia o seu código para lugar nenhum.** Sem conta, sem upload, sem telemetria. O bloco é redigido na sua máquina, pelo agente que você já está rodando, sobre a sua própria assinatura do modelo.
- **É só para frente.** Ele escreve o porquê dos PRs daqui para frente. Nunca reescreve o seu histórico já fechado, e nunca mexe no seu comando de git se algo der errado — um erro do hook sempre falha de forma aberta (fail-open).

**Gratuito e MIT, para sempre.** O [Backthread](https://backthread.dev) — a camada
hospedada paga — faz as partes entre equipes, históricas e de push proativo que um hook
local não consegue por estrutura: o porquê enviado até você, pesquisável em toda a sua base
de código, entre os agentes de todo mundo. Este hook não precisa de nada disso para ser útil
por conta própria. Se um dia você quiser a visão de equipe, ela está em
[backthread.dev](https://backthread.dev).

## Como funciona

O hook observa dois momentos: abrir um PR (`gh pr create`) e fazer um commit direto na sua
branch padrão. Quando vê um sem bloco do porquê, ele pede que o seu agente redija um bloco
fundamentado e só para frente a partir do próprio raciocínio da sessão — as **Decisões,
Trade-offs, Premissas e Limitações** por trás da mudança — e rode o comando de novo. O
bloco é embrulhado em um marcador invisível, então é escrito uma vez e nunca duplicado.

- **Commits de branch de feature dão a vez ao PR.** O trabalho espalhado por várias sessões
  é carregado adiante localmente, de modo que o bloco do PR cobre a branch inteira — mesmo
  que outra sessão o abra.
- **Nada nunca é inventado.** O agente faz primeiro uma verificação rápida e descarta
  qualquer linha que não consiga remontar a uma decisão real; se a sessão não deliberou,
  nenhum bloco é adicionado.
- **Ele nunca bloqueia o seu comando de git.** Todo modo de falha é um no-op silencioso —
  no pior caso, nenhum bloco é adicionado.

Cada bloco traz uma pequena atribuição visível para que os revisores vejam de onde ele
veio — e você pode editá-lo ou apagá-lo livremente.

## Controles

- **Desligar para um repositório:** `git config add-reasoning-to-prs.disabled true`
- **Pular um commit/PR específico:** coloque `[skip-why]` em qualquer lugar do comando.
- **Desligar globalmente:** defina `ADD_REASONING_TO_PRS_DISABLE=1` no ambiente a partir do
  qual você inicia o Claude Code.

## Roadmap

O estado honesto do projeto — o que funciona, o que vem a seguir e o que ele ainda não faz.

- **Funciona hoje:** o bloco do «porquê» no `gh pr create`, o fallback para a mensagem de
  commit no push direto, o carregamento entre várias sessões ao longo de uma branch, 100%
  local (o seu próprio modelo, sem conta), nunca inventa e falha de forma aberta.
- **A seguir:** suporte a Cursor e Codex (só Claude Code por enquanto — é o primeiro da
  lista) · cobertura dos PRs abertos no navegador · um formato de bloco do porquê mais
  enxuto.
- **Lacunas conhecidas:** a coleta entre sessões é feita na medida do possível (um bloco de
  rascunho local por branch), e como o bloco se lê depois de um squash-merge ainda está sendo
  refinado.

A lista completa fica em [Issues](../../issues) e [Discussions](../../discussions) —
dê 👍 nas limitações que importam para você e elas sobem na lista.

## Contribuindo

Contribuições são bem-vindas — especialmente correções de bugs, textos de prompt/orientação
mais afiados, cobertura de casos extremos e suporte a mais agentes. É uma ferramenta pequena
e de propósito único, e pretende continuar assim, então pedidos para ampliar o escopo
costumam ser recusados (com gentileza e um motivo). Comece pelo
[guia de contribuição](CONTRIBUTING.md) e pela etiqueta
[`good first issue`](../../labels/good%20first%20issue); se não tiver certeza se uma ideia
se encaixa, abra primeiro uma [Discussion](../../discussions).

## Dê uma estrela

Se isto te poupar de uma única escavação arqueológica pelos seus próprios PRs, uma ⭐ ajuda
outras pessoas a encontrá-lo.

## Licença

MIT © [Backthread](https://backthread.dev). Faça o que quiser com isto.
