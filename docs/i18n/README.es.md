[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Português](README.pt-BR.md) · [Русский](README.ru.md)

<div align="center">

# add-reasoning-to-prs

**PRs que se documentan solos.** Un hook de [Claude Code](https://docs.claude.com/en/docs/claude-code) que escribe el *porqué* — decisiones, concesiones, supuestos, limitaciones — en cada pull request, de forma automática. Redactado por tu propio agente, en tu propia máquina.

[![npm](https://img.shields.io/npm/v/add-reasoning-to-prs.svg)](https://www.npmjs.com/package/add-reasoning-to-prs)
[![CI](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml/badge.svg)](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8A63D2.svg)](https://docs.claude.com/en/docs/claude-code)

![Antes y después: un PR titulado «update auth flow» con una descripción vacía, junto al mismo PR con un bloque generado de Decisiones / Concesiones / Supuestos / Limitaciones.](assets/demo.gif)

</div>

> Las traducciones son un esfuerzo de la comunidad y pueden quedar desactualizadas. La versión en inglés ([README.md](README.md)) es la fuente autoritativa.

La IA escribe tu código. Nadie escribe el *porqué*. A las tres semanas, tu historial de
Git es un montón de decisiones que técnicamente son tuyas pero que nunca tomaste de
verdad — el diff dice *qué* cambió, `git blame` dice *quién*, y el razonamiento
simplemente… desapareció.

Este es un hook que lo arregla en el origen: justo antes de que tu agente abra un PR (o
haga un commit directo en tu rama por defecto), escribe un breve **bloque del «porqué»**
— las decisiones que tomó, las concesiones que sopesó, lo que supuso y lo que dejó fuera
a sabiendas — directamente en la descripción. A partir de la sesión real. No del diff.

## Instalación

Un solo comando:

```sh
npx add-reasoning-to-prs
```

Eso copia el hook autónomo y sin dependencias a una ubicación estable y lo registra en la
configuración de tu Claude Code (`~/.claude/settings.json`) como un hook `PreToolUse`. Sin
paso de compilación, sin cuenta, sin configuración.

O instala el **plugin de Claude Code** desde el marketplace (recomendado — registra el
hook desde el manifiesto del plugin y se actualiza con él, sin tocar la configuración de
tu proyecto).

> **Requisitos:** Claude Code y Node.js ≥ 22.18. Solo Claude Code, por ahora — Cursor y
> Codex son los siguientes.

## Qué hace

| | |
|---|---|
| **Bloque del «porqué» automático al crear el PR** | Cuando tu agente ejecuta `gh pr create` (o hace un commit en tu rama por defecto) sin uno, el hook le pide que escriba el bloque primero y luego vuelva a ejecutar el comando. Cero pasos manuales una vez instalado. |
| **Solo hacia adelante — nunca repite el diff** | Captura lo que un diff *no puede* mostrar: el razonamiento y los riesgos asumidos a sabiendas. Empieza por el único punto que un revisor no podría sacar del código, y nunca rellena con «refactoricé X, mejoré Y». |
| **Local, con tu propia suscripción, sin cuenta** | El bloque lo redacta tu propio agente, en la sesión. Sin ida y vuelta al servidor, no se almacena nada, y tu código nunca sale de tu máquina. |
| **Nunca inventa** | Cada línea tiene que remontarse a una decisión real de la sesión. Si el agente no deliberó de verdad, no se añade ningún bloque — un bloque vacío es la respuesta correcta para un cambio rutinario. |

## Qué **no** hace

- **No es un bot de revisión.** No califica tu código, no puntúa tu PR ni bloquea un merge. Se sitúa *por encima del diff*, junto a la revisión — aporta contexto, no juzga.
- **No es un diagrama, ni un wiki, ni un grafo de conocimiento.** Nada que explorar, nada que mantener sincronizado. Solo el porqué, escrito donde los revisores ya miran: la descripción del PR.
- **No lee ni envía tu código a ninguna parte.** Sin cuenta, sin subidas, sin telemetría. El bloque lo redacta, en tu máquina, el agente que ya estás usando, sobre tu propia suscripción al modelo.
- **Solo va hacia adelante.** Escribe el porqué de los PRs de aquí en adelante. Nunca reescribe tu historial cerrado, y nunca toca tu comando de git si algo sale mal — un error del hook siempre falla de forma abierta (fail-open).

**Gratis y MIT, para siempre.** [Backthread](https://backthread.dev) — la capa alojada de
pago — hace las partes entre equipos, históricas y de empuje proactivo que un hook local
no puede por su propia estructura: el porqué que llega a ti, buscable en toda tu base de
código, entre los agentes de todo el mundo. Este hook no necesita nada de eso para ser útil
por sí solo. Si algún día quieres la vista de equipo, está en
[backthread.dev](https://backthread.dev).

## Cómo funciona

El hook vigila dos momentos: abrir un PR (`gh pr create`) y hacer un commit directo en tu
rama por defecto. Cuando ve uno sin bloque del porqué, le pide a tu agente que redacte un
bloque fundamentado y solo hacia adelante a partir de su propio razonamiento de la sesión
— las **Decisiones, Concesiones, Supuestos y Limitaciones** detrás del cambio — y vuelva
a ejecutar el comando. El bloque va envuelto en un marcador invisible, así que se escribe
una vez y nunca se duplica.

- **Los commits de rama de característica ceden el paso al PR.** El trabajo repartido en
  varias sesiones se arrastra hacia adelante localmente, de modo que el bloque del PR cubre
  toda la rama — incluso si es otra sesión la que lo abre.
- **Nunca se inventa nada.** El agente hace primero una comprobación rápida y descarta
  cualquier línea que no pueda remontar a una decisión real; si la sesión no deliberó, no se
  añade bloque.
- **Nunca bloquea tu comando de git.** Cada modo de fallo es un no-op silencioso — en el
  peor de los casos, no se añade ningún bloque.

Cada bloque lleva una pequeña atribución visible para que los revisores vean de dónde
salió — y puedes editarlo o borrarlo libremente.

## Controles

- **Desactivarlo para un repositorio:** `git config add-reasoning-to-prs.disabled true`
- **Saltar un commit/PR concreto:** pon `[skip-why]` en cualquier parte del comando.
- **Desactivarlo globalmente:** define `ADD_REASONING_TO_PRS_DISABLE=1` en el entorno desde
  el que lanzas Claude Code.

## Hoja de ruta

El estado honesto del proyecto — qué funciona, qué viene y qué todavía no hace.

- **Funciona hoy:** el bloque del «porqué» en `gh pr create`, el respaldo al mensaje de
  commit en el push directo, el arrastre entre varias sesiones a lo largo de una rama, 100%
  local (tu propio modelo, sin cuenta), nunca inventa y falla de forma abierta.
- **Lo siguiente:** soporte para Cursor y Codex (solo Claude Code por ahora — es lo primero
  de la lista) · cobertura de los PRs abiertos en el navegador · un formato de bloque del
  porqué más ceñido.
- **Carencias conocidas:** la recopilación entre sesiones es en la medida de lo posible (un
  bloc de notas local por rama), y cómo se lee el bloque tras un squash-merge todavía se
  está afinando.

La lista completa está en [Issues](../../issues) y [Discussions](../../discussions) —
pon 👍 a las limitaciones que te importan y subirán en la lista.

## Contribuir

Las contribuciones son bienvenidas — sobre todo correcciones de errores, textos de
prompt/guía más afinados, cobertura de casos límite y soporte para más agentes. Es una
herramienta pequeña y de un solo propósito, y quiere seguir siéndolo, así que las peticiones
de ampliar el alcance suelen declinarse (amablemente, con un motivo). Empieza por la
[guía de contribución](CONTRIBUTING.md) y la etiqueta
[`good first issue`](../../labels/good%20first%20issue); si no estás seguro de si una idea
encaja, abre primero una [Discussion](../../discussions).

## Dale una estrella

Si esto te ahorra una sola excavación arqueológica por tus propios PRs, una ⭐ ayuda a que
otras personas lo encuentren.

## Licencia

MIT © [Backthread](https://backthread.dev). Haz lo que quieras con ello.
