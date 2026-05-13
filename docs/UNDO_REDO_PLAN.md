# Undo/Redo 実装プラン

> 本ドキュメントは `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` による操作取り消し・やり直し機能を実装するための、AI エージェントが Phase 単位で実行できる作業計画である。実装の対象は `/home/tom/maya_plguin/3dEngine` ブランチ `main`。

---

## Context

現プロジェクトは Electron 剥がし完了済みの Web SPA (`docs/WEB_MIGRATION_PLAN.md` の成果) で、3 層分離 (`engine/` / `store/` / `ui/`) と zustand v5 `subscribeWithSelector` を採用している。Undo/Redo はまだ存在しない。

`sceneStore` の主要アクションは `addObject` / `removeObject` / `setSelected` / `setTransformMode` / `commitTransform`。`commitTransform` は `lastCommitSource: 'engine' | 'ui'` を伴い、`'ui'` の場合のみ `ViewportPanel.tsx` の購読が Object3D に書き戻す仕組みになっている。この `'engine'` フラグを Undo/Redo の書き戻し抑制にも流用する。

`TransformController` は `dragging-changed: false` のタイミングで `onCommitTransform(target)` を発火するが、**ドラッグ開始時の transform を保持していない**ため、現状の API では「Undo に使う `before`」が取れない。本プランではここを拡張する。

PropertiesPanel の数値入力は `onChange` ごとに `commitTransform('ui')` を呼ぶ作りなので、そのまま履歴に積むと 1 キーストロークごとに 1 件積まれてしまう。本プランでは「編集セッション (focus → blur)」を導入し、blur 時にだけコマンドを execute する方式を採用する。

---

## Scope

### 含む

- `Ctrl/Cmd + Z` で Undo、`Ctrl/Cmd + Shift + Z` および `Ctrl + Y` で Redo
- 履歴対象操作:
  - トランスフォーム変更 (ギズモドラッグ完了 / PropertiesPanel の編集確定)
  - FBX インポートによるオブジェクト追加
- 履歴上限のデフォルト 100 件、API で変更可能 (`historyStore.setMaxHistorySize(n)`)
- 入力要素 (input/textarea/select/contenteditable) にフォーカス中はグローバル Ctrl+Z をフックせず、ブラウザ標準のテキスト Undo を妨げない
- 履歴ストアのユニットテスト、コマンドのユニットテスト、グローバルキーバインドのコンポーネントテスト、Undo/Redo の E2E テスト

### 含まない (将来用)

- オブジェクト削除の UI とその Undo (削除コマンドのスキーマだけ用意し、現時点では未使用)
- 選択 (`setSelected`) の Undo (Maya/Blender 慣例に従い対象外)
- TransformMode 切替 (`setTransformMode`) の Undo (ツール状態のため対象外)
- 初期キューブ生成 / FBX 初期同期など `lastCommitSource === 'engine'` 起因の commit (履歴に積まない)
- Preferences パネルからの履歴上限変更 UI (API は用意するが、操作可能な画面の追加は対象外)

---

## アーキテクチャの全体像

採用パターンは **Command パターン**。各操作を `do` / `undo` を持つコマンドオブジェクトとして表現し、`historyStore` の `past` / `future` スタックに積む。

```
[UI / Engine event]
      │
      ▼
historyStore.execute(command)   ──>   command.do()  ──>  past.push(command), future.clear()
                                                   │
                                                   ├─ sceneStore.commitTransform(after, 'engine')
                                                   ├─ SceneManager / Object3D 操作
                                                   └─ (将来) その他副作用

[Ctrl+Z]
      │
      ▼
historyStore.undo()  ──>  past.pop().undo()  ──>  future.push(command)
[Ctrl+Shift+Z or Ctrl+Y]
      │
      ▼
historyStore.redo()  ──>  future.pop().do()   ──>  past.push(command)
```

なぜスナップショット型ではなく Command 型か:

- FBX で追加した Object3D を Undo で取り除き Redo で復元する際、**同じ Object3D 参照を再利用**したい (再パースは重い、かつ参照同一性に依存する SceneManager の `idToObject` 整合性のため)
- PropertiesPanel の連続入力に対し将来「マージ」のような最適化を入れる余地を残す
- メモリ効率上、状態全体を毎回コピーするより差分のみが望ましい

---

## ディレクトリ構成

```
src/renderer/src/
├── history/                          # 新規
│   ├── commands.ts                   # Command 基底型と各 Command クラス
│   └── commands.test.ts
├── store/
│   ├── historyStore.ts               # 新規
│   ├── historyStore.test.ts          # 新規
│   ├── sceneStore.ts                 # 変更なし (low-level API はそのまま)
│   └── types.ts                      # 変更なし
├── engine/
│   └── controls/
│       └── TransformController.ts    # drag 開始の before スナップショット追加
└── ui/
    ├── hooks/
    │   ├── useGlobalUndoRedo.ts      # 新規
    │   └── useGlobalUndoRedo.test.tsx
    ├── layout/
    │   └── DockLayout.tsx            # useGlobalUndoRedo() 呼び出し
    └── panels/
        ├── ViewportPanel.tsx         # onCommitTransform を Command 化、FBX で AddObjectCommand
        └── PropertiesPanel.tsx       # focus/blur 編集セッションの導入
tests/e2e/
└── undo-redo.spec.ts                 # 新規
```

---

## 型定義

### Command (`src/renderer/src/history/commands.ts`)

```ts
export type CommandKind = 'transform' | 'add-object' | 'remove-object'

export interface Command {
  readonly kind: CommandKind
  do(): void
  undo(): void
}
```

`do` は「execute されたときの初回適用」「Redo」の両方で呼ばれる。Command 自身が必要な副作用 (sceneStore / SceneManager / Object3D の更新) を内包する。

### HistoryState (`src/renderer/src/store/historyStore.ts`)

```ts
export const DEFAULT_HISTORY_LIMIT = 100

export interface HistoryState {
  past: Command[]
  future: Command[]
  maxHistorySize: number
  canUndo: boolean
  canRedo: boolean
  execute: (command: Command) => void
  undo: () => void
  redo: () => void
  clear: () => void
  setMaxHistorySize: (n: number) => void
}
```

- `execute(cmd)`: `cmd.do()` → `past.push(cmd)` → `future` を空に → 上限超過分を `past.shift()` で破棄
- `undo()`: `past` が空なら no-op。`past.pop()` → `cmd.undo()` → `future.push(cmd)`
- `redo()`: `future` が空なら no-op。`future.pop()` → `cmd.do()` → `past.push(cmd)`
- `clear()`: `past` / `future` をクリア。次節 R2 (Object3D の保持) の dispose もここで行う
- `setMaxHistorySize(n)`: `n` を 1 以上にクランプ。`past.length > n` の場合は古い方から破棄
- `canUndo` / `canRedo` は派生値だが zustand では関数で導出するか setState 時に都度計算

---

## コマンド種別

### TransformCommand

```ts
class TransformCommand implements Command {
  readonly kind = 'transform'
  constructor(
    private readonly targetId: string,
    private readonly before: SceneTransform,
    private readonly after: SceneTransform,
    private readonly sceneManager: SceneManager
  ) {}

  do(): void { this.apply(this.after) }
  undo(): void { this.apply(this.before) }

  private apply(t: SceneTransform): void {
    const obj = this.sceneManager.getObjectById(this.targetId)
    if (!obj) return
    applyTransform(obj, t)
    // 'engine' を渡すことで ViewportPanel の購読が書き戻しを発火しない
    useSceneStore.getState().commitTransform(t, 'engine')
  }
}
```

注意点:

- `applyTransform` は既存の `src/renderer/src/engine/controls/TransformController.ts` の関数を利用
- selectedTransform を `'engine'` で更新するため、Properties パネルの表示は最新に追随する
- BoxHelper は `SceneManager.updateSelectionHelper()` がレンダーループ内で毎フレーム呼ばれるので追加対応不要

### AddObjectCommand

```ts
class AddObjectCommand implements Command {
  readonly kind = 'add-object'
  constructor(
    private readonly metas: SceneObjectMeta[],     // 親→子の順 (depth-first)
    private readonly root: THREE.Object3D,
    private readonly sceneManager: SceneManager,
    private readonly selectAfterDo: string | null  // 追加直後に選択する id (任意)
  ) {}

  do(): void {
    for (const meta of this.metas) {
      // root の場合は this.root、それ以外は対応する子 Object3D を辿る
      const obj = resolveObjectByMeta(meta, this.metas, this.root)
      this.sceneManager.addObject(meta, obj)
      useSceneStore.getState().addObject(meta)
    }
    if (this.selectAfterDo) {
      useSceneStore.getState().setSelected(this.selectAfterDo)
    }
  }

  undo(): void {
    // 子から親の順に取り除き、最後にルートを除去
    for (const meta of [...this.metas].reverse()) {
      this.sceneManager.removeObject(meta.id)
      useSceneStore.getState().removeObject(meta.id)
    }
    // Object3D は dispose しない (Redo 時に再アタッチするため)
  }
}
```

注意点:

- `SceneManager.removeObject` は対象 Object3D を `parent.remove()` するだけで dispose しないため、Redo 時に再 attach 可能 (要 SceneManager 側の確認・必要なら微修正)
- `removeObject` は `idToObject` から削除するので、Redo の `addObject` で再登録する必要あり (上の `do()` がこれを担保)
- ヘルパ関数 `resolveObjectByMeta` は metas の親子関係から Object3D ツリーを辿る。FBX importer は階層を保ったまま `THREE.Group` を返すので、`root.children` を再帰的に辿れば対応付け可能

### RemoveObjectCommand (スキーマのみ、現時点未使用)

UI に削除操作が無いため do/undo の実装は AddObjectCommand を反転させる形でクラスだけ用意し、`historyStore` に渡すコードパスは Phase 内では追加しない。

---

## 既存コードへの修正

### `engine/controls/TransformController.ts`

- フィールド `private dragStartTransform: SceneTransform | null = null` を追加
- `dragging-changed` リスナーを以下に変更:
  - `event.value === true` (ドラッグ開始): attachedObject の position/rotation/scale をスナップショットして `dragStartTransform` に保存
  - `event.value === false` (ドラッグ終了): `onCommitTransform(target, dragStartTransform)` を呼ぶ。`dragStartTransform` を null にリセット
- コンストラクタ引数の `onCommitTransform` のシグネチャを `(target: THREE.Object3D, before: SceneTransform | null) => void` に変更

### `ui/panels/ViewportPanel.tsx`

- `onCommitTransform` 内で:
  - `before === null` の場合 (理論上発生しないが安全策) は従来通り `commitTransform(after, 'engine')` のみ実行し、履歴には積まない
  - `before !== null` の場合は `historyStore.execute(new TransformCommand(targetId, before, after, sceneManager))` を呼ぶ
- `registerImportedGroup` 内で:
  - 現在は SceneManager と sceneStore に直接登録しているが、metas を集めて `historyStore.execute(new AddObjectCommand(metas, group, sceneManager, firstId))` に置き換える
  - 初期キューブ生成 (`DEFAULT_CUBE_ID`) は履歴に積まない (engine 起因の初期化のため)

### `ui/panels/PropertiesPanel.tsx`

「編集セッション」を導入し、focus 時の値を保持しつつ、onChange は従来どおり `commitTransform('ui')` を呼ぶ。blur 時に before/after が異なれば履歴に積む。

```ts
const editStartRef = useRef<SceneTransform | null>(null)

const handleFocus = (): void => {
  if (!selectedId || !selectedTransform) return
  editStartRef.current = cloneTransform(selectedTransform)
}

const handleBlur = (): void => {
  if (!selectedId) { editStartRef.current = null; return }
  const before = editStartRef.current
  const after = useSceneStore.getState().selectedTransform
  editStartRef.current = null
  if (!before || !after) return
  if (transformsEqual(before, after)) return
  historyStore.getState().execute(
    new TransformCommand(selectedId, before, after, sceneManager)
  )
}
```

- `AxisInput` に `onFocus` / `onBlur` を伝播させる
- `sceneManager` は ViewportPanel が保有しているため、PropertiesPanel に渡すには (a) Context 経由か (b) ViewportPanel と同じく `useSceneStore` 経由で id だけ伝えて、コマンド側で `useSceneStore` ではなく `sceneManager` 参照を解決するヘルパを用意するか、いずれか
  - 推奨案: `src/renderer/src/engine/sceneManagerRegistry.ts` のような単純なレジストリ (モジュールスコープの mutable 変数) を作り、ViewportPanel の `useEffect` 内で `setActiveSceneManager(sceneManager)` を呼んでおく。Command 側はこれを参照する
  - これにより PropertiesPanel/Command に sceneManager を props 経由で渡す必要がなくなる
  - レジストリは `dispose` 時に null クリアすること

### `ui/layout/DockLayout.tsx`

- `useGlobalUndoRedo()` を最上位で 1 回呼び出す
- 副作用フックなので戻り値は使わない

---

## キーバインド設計

### `ui/hooks/useGlobalUndoRedo.ts`

```ts
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useGlobalUndoRedo(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(document.activeElement)) return
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        historyStore.getState().undo()
        return
      }
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        historyStore.getState().redo()
        return
      }
      if (key === 'y' && !event.shiftKey) {
        event.preventDefault()
        historyStore.getState().redo()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
```

ポイント:

- `useKeybinds` (W/E/R) は DOM の `onKeyDown` 属性で受けていてフォーカス必須だが、Undo/Redo はアプリ全体で動いてほしいので `window` を使う
- 入力要素にフォーカス中の Ctrl+Z はブラウザ標準のテキスト Undo に委ねる
- macOS の Cmd 対応は `event.metaKey` で吸収
- Ctrl+Y は Shift が無いときのみ Redo

---

## 履歴上限の設定

- `DEFAULT_HISTORY_LIMIT = 100`
- `historyStore.setMaxHistorySize(n)`:
  - `Math.max(1, Math.floor(n))` でクランプ
  - 新しい上限 < `past.length` の場合は古い方から破棄
- UI は本 Phase では追加しない (将来 Preferences パネルから操作する想定)
- 一時的なテスト用途では `useSceneStore` と同様にモジュール外から `useHistoryStore.setState({ maxHistorySize: n })` でも変更可能

---

## 段階的実装ステップ (Phase 分け)

実装エージェントは下記の Phase を**順番に**処理し、各 Phase 終了時に `npm run typecheck && npm run lint && npm run test` を実行して緑であることを確認する。テスト追加・変更は AGENTS.md に従い**ユーザー承認後に着手**する。

### Phase 1 — 基盤型と historyStore

1. `src/renderer/src/history/commands.ts` を作成し、`CommandKind`, `Command` インタフェース、`TransformCommand` / `AddObjectCommand` / `RemoveObjectCommand` のクラスを実装 (副作用は次 Phase で組み込むが、do/undo の本体は揃える)
2. `src/renderer/src/store/historyStore.ts` を作成し、`HistoryState` を zustand で実装
3. ユニットテスト (新規追加): `historyStore.test.ts` で execute/undo/redo/clear/上限変更/上限超過破棄を網羅
4. ユニットテスト (新規追加): `commands.test.ts` で TransformCommand と AddObjectCommand の do/undo を SceneManager モックを使って検証

**Phase 1 完了条件**: 既存テスト + 追加テストが全て緑。既存挙動はゼロ変更 (historyStore.execute はまだどこからも呼ばれない)。

### Phase 2 — TransformCommand を組み込む (ギズモ操作)

1. `TransformController.ts` を改修:
   - `dragging-changed: true` で `dragStartTransform` をスナップショット
   - `dragging-changed: false` で `onCommitTransform(target, before)` を発火
2. `ViewportPanel.tsx` を改修:
   - `onCommitTransform` 内で `historyStore.execute(new TransformCommand(...))` を呼ぶ
   - `sceneManagerRegistry` を導入し、`useEffect` 内で `setActiveSceneManager(sceneManager)` / クリーンアップで null
3. ユニットテスト (新規追加): `TransformController.test.ts` の既存ケースに drag 開始時のスナップショット保持を確認するケースを追加
4. 既存スナップショットの更新が必要なら、内容差分をユーザーに提示してから更新

**Phase 2 完了条件**: ギズモでオブジェクトを動かしたあと、`historyStore.getState().undo()` を DevTools から呼ぶと元に戻る。

### Phase 3 — PropertiesPanel の編集セッション

1. `PropertiesPanel.tsx` に focus/blur ハンドラを追加し、blur で TransformCommand を execute
2. `AxisInput` に `onFocus` / `onBlur` を伝播
3. ヘルパ `cloneTransform` / `transformsEqual` を `history/commands.ts` か共通 util に追加
4. ユニットテスト (新規追加): `PropertiesPanel.test.tsx` に
   - 編集中の onChange では履歴に積まれない
   - blur で 1 件だけ積まれる
   - 変更が無い blur では積まれない
   を追加

**Phase 3 完了条件**: 連続キーストロークでも履歴は 1 件だけ。Undo で元の値に戻る。

### Phase 4 — FBX インポートの AddObjectCommand

1. `ViewportPanel.tsx` の `registerImportedGroup` を Command 経由に変更
2. SceneManager 側 `removeObject` が Object3D を dispose しないことを再確認 (現状そうなっているが、コメントで明示)
3. ユニットテスト (新規追加): `commands.test.ts` に AddObjectCommand の階層復元ケース

**Phase 4 完了条件**: FBX をインポートした後 Undo するとシーンから消え、Redo で復元される。

### Phase 5 — グローバルキーバインドと統合

1. `ui/hooks/useGlobalUndoRedo.ts` を実装
2. `DockLayout.tsx` で呼び出し
3. コンポーネントテスト (新規追加): `useGlobalUndoRedo.test.tsx`
   - 入力要素フォーカス時は undo されないこと
   - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Cmd+Z の各組み合わせ
4. E2E テスト (新規追加): `tests/e2e/undo-redo.spec.ts`
   - PropertiesPanel で位置 X を 0 → 5 に編集後、Tab で blur → Ctrl+Z で 0 に戻る → Ctrl+Shift+Z で 5 に戻る
   - input にフォーカス中の Ctrl+Z は履歴 Undo ではなくテキスト Undo として動作する (位置が変わらない)

**Phase 5 完了条件**: ブラウザでショートカット操作が機能し、E2E が全て緑。

---

## テスト方針

> ⚠️ AGENTS.md ルール: テストの新規追加・既存テストへの変更は**実装エージェントが着手前にユーザーへ確認**すること。本ドキュメントはテスト**設計**を記述するのみで、確認なしのテスト変更を許可するものではない。

### ユニット (Vitest)

| ファイル | 内容 |
| --- | --- |
| `store/historyStore.test.ts` | execute/undo/redo の状態遷移、`future` のクリア条件、上限超過破棄、`setMaxHistorySize` の影響、`clear` |
| `history/commands.test.ts` | TransformCommand の do/undo が SceneManager+sceneStore を期待どおり更新する。AddObjectCommand の階層復元 |
| `store/sceneStore.test.ts` | 変更なし (既存テスト緑のままを維持) |

### コンポーネント (Vitest + RTL)

| ファイル | 内容 |
| --- | --- |
| `ui/hooks/useGlobalUndoRedo.test.tsx` | input にフォーカスがある時 undo されないこと、各キー組合せで undo/redo が呼ばれること |
| `ui/panels/PropertiesPanel.test.tsx` | (追加) 編集セッションの履歴生成条件 |

### E2E (Playwright)

| ファイル | 内容 |
| --- | --- |
| `tests/e2e/undo-redo.spec.ts` | (新規) ギズモ操作と PropertiesPanel 編集の Undo/Redo、FBX インポートの Undo、input フォーカス時の Ctrl+Z 振る舞い |

---

## エッジケース

| ケース | 期待挙動 |
| --- | --- |
| undo 中に新しい操作が来る | `future` をクリアして `past` に積む (一般的な挙動) |
| 履歴に積んだオブジェクトを `setSelected(null)` した直後 Undo | TransformCommand は targetId から Object3D を解決するので問題なし。BoxHelper は SceneManager の selection 購読で自動更新される |
| 履歴に積んだ Object3D が `clear()` で破棄されるとき | AddObjectCommand が保持している Object3D を dispose する必要あり。`clear` で `past`+`future` を走査し、`kind === 'add-object'` のコマンドが保持する Object3D を `traverse` して geometry/material を dispose |
| `setMaxHistorySize` で上限を超えて `past` から押し出されるコマンド | 押し出される際にも上記 dispose を実施 |
| FBX インポート中にエラーが発生した場合 | `registerImportedGroup` の前段でエラーになっているので historyStore は呼ばれない |
| ViewportPanel の dispose (アンマウント) | `historyStore.clear()` を呼ぶか、参照だけ残してアプリ再マウントで初期化されるか。MVP では「アンマウント時に clear()」を採用 |
| WebGL コンテキストロスト中の Ctrl+Z | undo 自体は走るが Three.js の描画は止まっている。コンテキスト復旧後の再描画は別問題のため本 Phase 対象外 |

---

## リスク・前提

- (R1) `applyTransform` は `target.updateMatrix()` を呼ぶが、`updateMatrixWorld` は呼ばないため子孫の世界変換が古くなる可能性がある。BoxHelper はレンダーループで `update()` されるので影響は限定的だが、Phase 2 完了時に視覚確認すること
- (R2) `sceneManagerRegistry` というモジュールスコープの mutable 変数はテストでのリセットに注意が必要。`vi.resetModules()` か、レジストリ自体に `reset()` を生やしておくこと
- (R3) Three.js の TransformControls が drag 開始イベントの直前に attach されたばかりの場合、`attachedObject` 参照が想定外になる可能性。Phase 2 では「attach 直後すぐに drag 開始したケース」のテストも入れる
- (R4) `historyStore` を React 外 (Command クラス) から呼ぶ際は `useHistoryStore.getState()` を使う。zustand v5 の selector subscribe ではないため再レンダリングを誘発しない点を確認すること
- (R5) PropertiesPanel の `AxisInput` は `disabled` 状態があるが、disabled の input は focus できないため編集セッションは発生しない (問題なし)

---

## 完了条件 (全 Phase 通しての受け入れ基準)

1. `npm run typecheck && npm run lint && npm run test` が緑
2. `npm run test:e2e` が緑 (`undo-redo.spec.ts` を含む)
3. ブラウザで以下を手動確認:
   - デフォルトキューブをギズモで移動 → Ctrl+Z で元に戻る → Ctrl+Shift+Z で再適用
   - PropertiesPanel で位置 X を 3 回連続変更し Tab で blur → Ctrl+Z 1 回で blur 前の値に戻る (3 回分まとめて取り消されない = 編集セッション 1 回分のみ取り消し)
   - FBX をインポート → Ctrl+Z でシーンから消える → Ctrl+Y で復元
   - PropertiesPanel の入力欄にフォーカス中の Ctrl+Z はテキスト Undo として動作する (オブジェクト位置は変わらない)
4. `historyStore.setMaxHistorySize(5)` をテストか DevTools から呼んだ後、6 回 execute → 最古のコマンドが破棄されることを確認
