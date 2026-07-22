[English](../../README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

<div align="center">

# add-reasoning-to-prs

**自记录的 PR。** 一个 [Claude Code](https://docs.claude.com/en/docs/claude-code) 钩子，自动把每一次改动的 *为什么* —— 决策、权衡、假设、已知局限 —— 写进每一个拉取请求。由你自己的智能体、在你自己的机器上生成。

[![npm](https://img.shields.io/npm/v/add-reasoning-to-prs.svg)](https://www.npmjs.com/package/add-reasoning-to-prs)
[![CI](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml/badge.svg)](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8A63D2.svg)](https://docs.claude.com/en/docs/claude-code)

![前后对比：一个标题为「update auth flow」、描述为空的 PR，与同一个 PR 但已生成「决策 / 权衡 / 假设 / 局限」区块的样子并排。](../../assets/demo.gif)

</div>

> 翻译由社区尽力维护，可能滞后。以英文版（[README.md](../../README.md)）为准。

AI 帮你写代码，却没人写下 *为什么*。三周之后，你的 Git 历史就成了一堆你名义上拥有、
却从未真正做过的决定 —— diff 告诉你 *改了什么*，`git blame` 告诉你 *谁改的*，而背后的
理由早已… 无从寻觅。

这个钩子从源头解决它：就在你的智能体开启一个 PR（或往默认分支落下一次提交）之前，它会
把一段简短的 **「为什么」区块** —— 它做出的决策、权衡过的取舍、假设了什么、以及有意
留下了什么 —— 直接写进描述里。取自真实的会话，而非 diff。

## 安装

一条命令：

```sh
npx add-reasoning-to-prs
```

它会把这个自包含、零依赖的钩子复制到一个稳定的位置，并在你的 Claude Code 设置
（`~/.claude/settings.json`）中把它注册为一个 `PreToolUse` 钩子。无需构建步骤、无需账户、
无需配置。

或者从市场安装 **Claude Code 插件**（推荐 —— 它会从插件清单注册该钩子，随插件一同更新，
而不会改动你的项目设置）。

> **环境要求：** Claude Code 与 Node.js ≥ 22.18。目前仅支持 Claude Code —— Cursor 和 Codex
> 是接下来的计划。

## 它做什么

| | |
|---|---|
| **创建 PR 时自动生成「为什么」区块** | 当你的智能体在没有「为什么」区块的情况下运行 `gh pr create`（或向默认分支提交）时，钩子会先要求它写出该区块，然后重新运行命令。一旦装好，就零手动步骤。 |
| **只向前，绝不复述 diff** | 它捕捉 diff *无法* 展示的东西：推理，以及明知却仍承担的风险。它以审阅者从代码里得不到的那一点开头，绝不用「重构了 X、改进了 Y」来凑数。 |
| **本地运行、用你自己的订阅、无需账户** | 区块由你自己的智能体在会话内生成。没有服务器往返，不存储任何东西，你的源代码不会离开你的机器。 |
| **绝不编造** | 每一行都必须能追溯到会话中一个真实的决定。如果智能体并未真正权衡过，就不会添加区块 —— 对于例行改动，空区块才是正确答案。 |

## 它 **不** 做什么

- **它不是审查机器人。** 它不给你的代码打分、不给 PR 评级、也不拦截合并。它位于 diff *之上*，与审阅并肩 —— 它补充上下文，而不做评判。
- **它不是图表、维基或知识图谱。** 没有东西要浏览，也没有东西要保持同步。只是把为什么，写在审阅者本来就会看的地方：PR 描述。
- **它不会读取或把你的源代码发往任何地方。** 没有账户、没有上传、没有遥测。区块由你已经在运行的智能体、在你自己的模型订阅上、在你的机器上生成。
- **它只向前。** 它为今后的 PR 写下为什么。它绝不改写你已关闭的历史，一旦出现任何问题也绝不干预你的 git 命令 —— 钩子出错时始终「失败即放行」。

**免费、MIT，永久如此。** [Backthread](https://backthread.dev)（付费的托管层）负责本地钩子
在结构上做不到的部分：跨团队、历史、以及主动推送 —— 把为什么推送给你，让它可以跨整个代码库、
跨所有人的智能体进行搜索。这个钩子无需这些，单独使用就已经有用。如果你哪天想要团队视图，
它就在 [backthread.dev](https://backthread.dev)。

## 工作原理

钩子会盯着两个时刻：开启一个 PR（`gh pr create`），以及向默认分支直接提交。当它发现其中
一个缺少「为什么」区块时，就会要求你的智能体，从它自己的会话推理中，写出一段有据可循、
只向前的区块 —— 改动背后的 **决策、权衡、假设与局限** —— 并重新运行命令。区块被一个隐形
标记包裹，因此只写一次，绝不重复。

- **特性分支上的提交会让位给 PR。** 分散在多个会话里的工作会在本地被向前携带，因此 PR 的
  区块能覆盖整条分支 —— 即便是由另一个会话开启的 PR。
- **绝不凭空捏造。** 智能体会先做一次快速自检，丢弃任何无法追溯到真实决定的行；如果这次会话
  没有真正权衡过，就不添加区块。
- **它绝不阻断你的 git 命令。** 每一种失败模式都是安静的空操作 —— 最坏的情况，也只是没有
  添加区块。

每个区块都带有一个小小的可见署名，让审阅者能看出它从何而来 —— 而你可以自由地编辑或删除它。

## 控制项

- **对某个仓库关闭：** `git config add-reasoning-to-prs.disabled true`
- **跳过某一次提交/PR：** 在命令中的任意位置放上 `[skip-why]`。
- **全局关闭：** 在你启动 Claude Code 的环境中设置 `ADD_REASONING_TO_PRS_DISABLE=1`。

## 路线图

这个项目诚实的现状 —— 什么能用、下一步是什么、以及它还不做什么。

- **今天可用：** `gh pr create` 时的「为什么」区块、直接推送时回退到提交信息、跨分支的多会话
  携带、100% 本地（你自己的模型、无需账户）、绝不编造，以及失败即放行。
- **接下来：** 支持 Cursor 和 Codex（目前仅 Claude Code —— 这是清单的第一位）· 覆盖在浏览器
  中开启的 PR · 更紧凑的「为什么」区块格式。
- **已知欠缺：** 多会话收集是尽力而为（一个本地的、按分支划分的暂存本），而区块在 squash
  合并之后如何呈现仍在打磨中。

完整清单见 [Issues](https://github.com/backthread/add-reasoning-to-prs/issues) 与 [Discussions](https://github.com/backthread/add-reasoning-to-prs/discussions) —— 给你在意的局限
点个 👍，它们就会在清单里往上走。

## 参与贡献

欢迎贡献 —— 尤其是错误修复、更精准的提示/引导文案、边界情况覆盖，以及对更多智能体的支持。
它是一个小而单一用途的工具，也打算一直如此，因此扩大范围的请求通常会（客气地、附上理由）
被婉拒。请从[贡献指南](../../CONTRIBUTING.md)和 [`good first issue`](https://github.com/backthread/add-reasoning-to-prs/labels/good%20first%20issue)
标签开始；如果你不确定某个想法是否合适，可以先开一个 [Discussion](https://github.com/backthread/add-reasoning-to-prs/discussions)。

## 给它加星

如果这为你省下了哪怕一次翻遍自己旧 PR 的「考古挖掘」，一颗 ⭐ 能帮助更多人发现它。

## 许可证

MIT © [Backthread](https://backthread.dev)。随你怎么用。
