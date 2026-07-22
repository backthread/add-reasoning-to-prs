[English](../../README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

<div align="center">

# add-reasoning-to-prs

**自我記錄的 PR。** 一個 [Claude Code](https://docs.claude.com/en/docs/claude-code) 掛鉤，自動把每一次變更的 *為什麼* —— 決策、取捨、假設、已知限制 —— 寫進每一個拉取請求。由你自己的代理、在你自己的機器上生成。

[![npm](https://img.shields.io/npm/v/add-reasoning-to-prs.svg)](https://www.npmjs.com/package/add-reasoning-to-prs)
[![CI](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml/badge.svg)](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8A63D2.svg)](https://docs.claude.com/en/docs/claude-code)

![前後對比：一個標題為「update auth flow」、描述為空的 PR，與同一個 PR 但已生成「決策 / 取捨 / 假設 / 限制」區塊的樣子並排。](../../assets/demo.gif)

</div>

> 翻譯由社群盡力維護，可能會落後。以英文版（[README.md](../../README.md)）為準。

AI 幫你寫程式碼，卻沒人寫下 *為什麼*。三週之後，你的 Git 歷史就成了一堆你名義上擁有、
卻從未真正做過的決定 —— diff 告訴你 *改了什麼*，`git blame` 告訴你 *誰改的*，而背後的
理由早已… 無從尋覓。

這個掛鉤從源頭解決它：就在你的代理開啟一個 PR（或往預設分支落下一次提交）之前，它會
把一段簡短的 **「為什麼」區塊** —— 它做出的決策、權衡過的取捨、假設了什麼、以及有意
留下了什麼 —— 直接寫進描述裡。取自真實的工作階段，而非 diff。

## 安裝

一條命令：

```sh
npx add-reasoning-to-prs
```

它會把這個自包含、零相依的掛鉤複製到一個穩定的位置，並在你的 Claude Code 設定
（`~/.claude/settings.json`）中把它註冊為一個 `PreToolUse` 掛鉤。無需建置步驟、無需帳號、
無需設定。

或者從市集安裝 **Claude Code 外掛**（推薦 —— 它會從外掛資訊清單註冊該掛鉤，隨外掛一同更新，
而不會動到你的專案設定）。

> **環境需求：** Claude Code 與 Node.js ≥ 22.18。目前僅支援 Claude Code —— Cursor 和 Codex
> 是接下來的計畫。

## 它做什麼

| | |
|---|---|
| **建立 PR 時自動生成「為什麼」區塊** | 當你的代理在沒有「為什麼」區塊的情況下執行 `gh pr create`（或向預設分支提交）時，掛鉤會先要求它寫出該區塊，然後重新執行命令。一旦裝好，就零手動步驟。 |
| **只向前，絕不複述 diff** | 它捕捉 diff *無法* 展示的東西：推理，以及明知卻仍承擔的風險。它以審閱者從程式碼裡得不到的那一點開頭，絕不用「重構了 X、改進了 Y」來湊數。 |
| **本地執行、用你自己的訂閱、無需帳號** | 區塊由你自己的代理在工作階段內生成。沒有伺服器往返，不儲存任何東西，你的原始碼不會離開你的機器。 |
| **絕不捏造** | 每一行都必須能追溯到工作階段中一個真實的決定。如果代理並未真正權衡過，就不會加入區塊 —— 對於例行變更，空的區塊才是正確答案。 |

## 它 **不** 做什麼

- **它不是審查機器人。** 它不給你的程式碼打分、不給 PR 評級、也不攔截合併。它位於 diff *之上*，與審閱並肩 —— 它補充脈絡，而不做評判。
- **它不是圖表、Wiki 或知識圖譜。** 沒有東西要瀏覽，也沒有東西要保持同步。只是把為什麼，寫在審閱者本來就會看的地方：PR 描述。
- **它不會讀取或把你的原始碼送往任何地方。** 沒有帳號、沒有上傳、沒有遙測。區塊由你已經在執行的代理、在你自己的模型訂閱上、在你的機器上生成。
- **它只向前。** 它為今後的 PR 寫下為什麼。它絕不改寫你已關閉的歷史，一旦出現任何問題也絕不干預你的 git 命令 —— 掛鉤出錯時始終「失敗即放行」。

**免費、MIT，永久如此。** [Backthread](https://backthread.dev)（付費的託管層）負責本地掛鉤
在結構上做不到的部分：跨團隊、歷史、以及主動推送 —— 把為什麼推送給你，讓它可以跨整個程式碼庫、
跨所有人的代理進行搜尋。這個掛鉤無需這些，單獨使用就已經有用。如果你哪天想要團隊檢視，
它就在 [backthread.dev](https://backthread.dev)。

## 運作原理

掛鉤會盯著兩個時刻：開啟一個 PR（`gh pr create`），以及向預設分支直接提交。當它發現其中
一個缺少「為什麼」區塊時，就會要求你的代理，從它自己的工作階段推理中，寫出一段有據可循、
只向前的區塊 —— 變更背後的 **決策、取捨、假設與限制** —— 並重新執行命令。區塊被一個隱形
標記包裹，因此只寫一次，絕不重複。

- **特性分支上的提交會讓位給 PR。** 分散在多個工作階段裡的工作會在本地被向前攜帶，因此 PR 的
  區塊能涵蓋整條分支 —— 即便是由另一個工作階段開啟的 PR。
- **絕不憑空捏造。** 代理會先做一次快速自我檢查，捨棄任何無法追溯到真實決定的行；如果這次
  工作階段沒有真正權衡過，就不加入區塊。
- **它絕不阻斷你的 git 命令。** 每一種失敗模式都是安靜的空操作 —— 最壞的情況，也只是沒有
  加入區塊。

每個區塊都帶有一個小小的可見署名，讓審閱者能看出它從何而來 —— 而你可以自由地編輯或刪除它。

## 控制項

- **對某個儲存庫關閉：** `git config add-reasoning-to-prs.disabled true`
- **略過某一次提交/PR：** 在命令中的任意位置放上 `[skip-why]`。
- **全域關閉：** 在你啟動 Claude Code 的環境中設定 `ADD_REASONING_TO_PRS_DISABLE=1`。

## 藍圖

這個專案誠實的現狀 —— 什麼能用、下一步是什麼、以及它還不做什麼。

- **今天可用：** `gh pr create` 時的「為什麼」區塊、直接推送時回退到提交訊息、跨分支的多工作
  階段攜帶、100% 本地（你自己的模型、無需帳號）、絕不捏造，以及失敗即放行。
- **接下來：** 支援 Cursor 和 Codex（目前僅 Claude Code —— 這是清單的第一位）· 涵蓋在瀏覽器
  中開啟的 PR · 更緊湊的「為什麼」區塊格式。
- **已知缺口：** 多工作階段收集是盡力而為（一個本地的、按分支劃分的暫存本），而區塊在 squash
  合併之後如何呈現仍在打磨中。

完整清單見 [Issues](https://github.com/backthread/add-reasoning-to-prs/issues) 與 [Discussions](https://github.com/backthread/add-reasoning-to-prs/discussions) —— 給你在意的限制
點個 👍，它們就會在清單裡往上走。

## 參與貢獻

歡迎貢獻 —— 尤其是錯誤修正、更精準的提示/引導文案、邊界情況涵蓋，以及對更多代理的支援。
它是一個小而單一用途的工具，也打算一直如此，因此擴大範圍的請求通常會（客氣地、附上理由）
被婉拒。請從[貢獻指南](../../CONTRIBUTING.md)和 [`good first issue`](https://github.com/backthread/add-reasoning-to-prs/labels/good%20first%20issue)
標籤開始；如果你不確定某個想法是否合適，可以先開一個 [Discussion](https://github.com/backthread/add-reasoning-to-prs/discussions)。

## 給它加星

如果這為你省下了哪怕一次翻遍自己舊 PR 的「考古挖掘」，一顆 ⭐ 能幫助更多人發現它。

## 授權

MIT © [Backthread](https://backthread.dev)。隨你怎麼用。
