# 3D DCCエンジン プロトタイプ実装プラン

## Context

ユーザーは Maya/Blender のような DCC (Digital Content Creation) ツールのプロトタイプを新規開発したい。要件は Windows/Linux 両対応、モダンUI、FBXインポート、オブジェクトの選択/移動/回転/スケール、カメラの軌道回転。
ユーザーは描画ライブラリ・3D処理に詳しくないため、技術選定は相談で進める方針。協議の結果、技術スタックは **Electron + React + TypeScript + Three.js** に確定。
本プランは「動くか確認する」プロトタイプを最短で立ち上げるための、AIエージェントが Phase 単位で実行できる実装計画である。

リポジトリ `/home/tom/maya_plguin/3dEngine` は git のみ初期化済みのグリーンフィールド。

テスト方針については、ユーザーから「疎結合の担保」「ゴールデンテスト」「E2E テスト」の実装要望あり。3層分離アーキテクチャ（engine / store / ui）と Vitest + RTL + Playwright を組み合わせて、各 Phase でテスト成果物を生成する。

---

## 技術スタック（確定）

| 領域 | 採用技術 |
|---|---|
| デスクトップ基盤 | Electron + `electron-vite`（テンプレート: react-ts） |
| UI | React 18 + TypeScript 5 |
| スタイル | Tailwind CSS + shadcn/ui |
| ドックレイアウト | `react-resizable-panels` |
| 3D描画 | Three.js（バニラ、`@react-three/fiber` は使わない） |
| 状態管理 | Zustand（`subscribeWithSelector` 有効化） |
| パッケージング | electron-builder（Windows: nsis / Linux: AppImage） |
| ユニット/コンポーネントテスト | Vitest + happy-dom + @testing-library/react |
| ゴールデンテスト | Vitest snapshot（`toMatchSnapshot` / `toMatchInlineSnapshot`） |
| E2E テスト | Playwright（`@playwright/test` の `_electron` API） |

### 依存ライブラリ確定リスト

#### dependencies（ランタイム）
- `react`, `react-dom`
- `three`
- `zustand`
- `clsx`, `tailwind-merge`
- `lucide-react`
- `react-resizable-panels`
- `@radix-ui/react-*`（shadcn `add` 実行時に自動追加されるため事前手動インストール不要）

#### devDependencies（開発）
- `electron`
- `electron-vite`, `vite`, `@vitejs/plugin-react`
- `electron-builder`
- `typescript`
- `@types/react`, `@types/react-dom`, `@types/node`, `@types/three`
- `tailwindcss`, `postcss`, `autoprefixer`
- `eslint`, `prettier`

#### devDependencies（テスト）
- `vitest` — ユニット/コンポーネントテストランナー
- `@vitest/coverage-v8` — カバレッジ
- `@vitest/ui` — テスト結果のブラウザ UI（任意、開発時便利）
- `happy-dom` — DOM 環境（jsdom より高速）
- `@testing-library/react` — React コンポーネントテスト
- `@testing-library/jest-dom` — DOM マッチャ拡張
- `@testing-library/user-event` — ユーザー操作シミュレート
- `@playwright/test` — E2E（Electron 対応の `_electron` API 内蔵）

#### 入れてはいけない
- ❌ `fflate` — three の `examples/jsm/libs/fflate.module.js` と衝突して `fflate.unzlibSync is not a function` 等の原因になる
- ❌ `three-stdlib` — 最新の three は `examples/jsm` を直接 ESM で読めるため不要
- ❌ `@react-three/fiber` — 要件は素の Three.js 利用。fiber を入れると状態管理設計が変わる
- ❌ `jsdom` — happy-dom と二重化、後者で十分

---

## ディレクトリ構成（目標形）

```
3dEngine/
├─ docs/
│  └─ PLAN.md                        # 本プランのコピー（Phase 0 で配置済み）
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ vitest.config.ts                  # Vitest 設定（renderer 用）
├─ playwright.config.ts              # E2E 設定
├─ package.json
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json
├─ tailwind.config.js
├─ postcss.config.js
├─ components.json                   # shadcn/ui 設定
├─ tests/
│  ├─ setup.ts                       # RTL + jest-dom セットアップ
│  ├─ fixtures/
│  │  └─ samples/
│  │     └─ test-cube.fbx            # E2E / ゴールデン用 小サイズ FBX
│  ├─ helpers/
│  │  ├─ mockRenderer.ts             # WebGLRenderer スタブ
│  │  └─ electronAppHelper.ts        # Playwright ヘルパ
│  └─ e2e/
│     ├─ app.spec.ts
│     ├─ viewport.spec.ts
│     ├─ selection.spec.ts
│     ├─ transform.spec.ts
│     └─ fbx-import.spec.ts
└─ src/
   ├─ main/                          # Electron メインプロセス
   │  ├─ index.ts
   │  ├─ window.ts
   │  ├─ ipc/
   │  │  ├─ dialog.ts                # showOpenDialog
   │  │  ├─ dialog.test.ts
   │  │  ├─ fs.ts                    # readFile → ArrayBuffer
   │  │  └─ fs.test.ts
   │  └─ menu.ts
   ├─ preload/
   │  ├─ index.ts                    # contextBridge.exposeInMainWorld('api', ...)
   │  └─ index.d.ts                  # window.api 型
   ├─ shared/
   │  └─ ipc.ts                      # IPC チャネル名と引数/戻り値の共有型
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.tsx
         ├─ App.tsx
         ├─ index.css
         ├─ engine/                  # Three.js 純粋ロジック層（React 非依存）
         │  ├─ SceneManager.ts
         │  ├─ SceneManager.test.ts
         │  ├─ Viewport.ts
         │  ├─ Viewport.test.ts
         │  ├─ controls/
         │  │  ├─ OrbitController.ts
         │  │  ├─ TransformController.ts
         │  │  └─ TransformController.test.ts
         │  ├─ selection/
         │  │  ├─ Raycaster.ts
         │  │  ├─ Raycaster.test.ts
         │  │  └─ Highlighter.ts
         │  ├─ loaders/
         │  │  ├─ FbxImporter.ts
         │  │  └─ FbxImporter.test.ts   # ゴールデン（FBX ツリー構造）
         │  └─ types.ts
         ├─ store/
         │  ├─ sceneStore.ts
         │  ├─ sceneStore.test.ts       # ユニット + ゴールデン（初期/選択後状態）
         │  └─ types.ts
         ├─ ui/
         │  ├─ layout/
         │  │  ├─ DockLayout.tsx
         │  │  ├─ DockLayout.test.tsx
         │  │  ├─ Menubar.tsx
         │  │  └─ StatusBar.tsx
         │  ├─ panels/
         │  │  ├─ ViewportPanel.tsx
         │  │  ├─ OutlinerPanel.tsx
         │  │  ├─ OutlinerPanel.test.tsx
         │  │  └─ PropertiesPanel.tsx
         │  ├─ components/ui/        # shadcn 生成物
         │  └─ hooks/
         │     ├─ useEngine.ts
         │     └─ useKeybinds.ts
         └─ lib/
            └─ cn.ts
```

### アーキテクチャ原則
- `engine/` は React を import しない（純粋 TS）
- `store/` は React にも engine にも依存しない（Zustand のみ）
- `ui/` が engine と store を束ねる
- **Three.js シーングラフが Single Source of Truth**。Zustand にはメタデータ（id, name, type, parentId, visible, selectedId, transformMode）のみを置き、毎フレーム更新するような Object3D 自体は格納しない。

---

## テスト戦略

### 1. テスト種別とレイヤー対応

| レイヤー | テスト種別 | ツール | 走る環境 |
|---|---|---|---|
| `engine/`（純粋 TS） | ユニット + ゴールデン | Vitest | Node + happy-dom |
| `store/`（Zustand） | ユニット + ゴールデン | Vitest | Node |
| `ui/`（React） | コンポーネント | Vitest + RTL | happy-dom |
| `main/`（Electron） | ユニット（薄く） | Vitest（electron API はモック） | Node |
| 全体フロー | E2E | Playwright `_electron` | 実 Electron（headed/headless） |

### 2. ゴールデンテストの対象

「描画ピクセルの差分」ではなく **構造化スナップショット（JSON）** を採用。WebGL に依存せず CI で安定する。

| 対象 | 形式 | 配置 |
|---|---|---|
| Zustand 初期ストア状態 | `expect(store.getState()).toMatchSnapshot()` | `sceneStore.test.ts` |
| 各 action 適用後のストア状態 | 同上、シナリオ別 | `sceneStore.test.ts` |
| FBX ロード後の Object3D ツリー構造 | `serializeTree(group)` の JSON スナップショット | `FbxImporter.test.ts` |
| Three.js シーンの `toJSON()` | 必要に応じてシーン全体 | `SceneManager.test.ts` |
| Transform 適用後の局所行列 | matrix4 を配列化してスナップショット | `TransformController.test.ts` |

`serializeTree` はテストヘルパで、`{ type, name, position, rotation, scale, children: [...] }` を抽出する純粋関数として用意する。

### 3. Three.js を Node で扱うための方針

- **`Scene`, `Mesh`, `Group`, `Camera`, `Object3D` などのシーングラフ系は Node でそのまま動く**ためモック不要
- **`WebGLRenderer` のみ Node では動かない** → `tests/helpers/mockRenderer.ts` で最小限のスタブを用意（`setSize`, `setPixelRatio`, `render`, `dispose` を noop で持つ）
- `Viewport` / `SceneManager` のコンストラクタを **依存性注入**（renderer を引数で受け取る）にして、テスト時はモック renderer を注入できるよう設計する
- `OrbitControls` / `TransformControls` は DOM イベントに依存するため、ロジック部分（モード切替、`dragging-changed` ハンドラ）を切り出して純粋関数化したものをテストし、本体は E2E で検証

### 4. 疎結合の担保（DI パターン）

各クラスは具象クラスではなく型を受け取る:

```ts
// engine/Viewport.ts
export interface IRenderer {
  setSize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  domElement: HTMLCanvasElement;
}

export class Viewport {
  constructor(private renderer: IRenderer, /* ... */) {}
}
```

これで Vitest 側は `MockRenderer` を、本番は `THREE.WebGLRenderer` を注入できる。`SceneManager` も同様に `(scene, store, transformController)` 形式で DI する。

### 5. E2E テスト構成（Playwright + Electron）

- `playwright.config.ts` で `workers: 1`（Electron はシリアル実行）、`testDir: './tests/e2e'`
- 各テストは `_electron.launch({ args: ['./out/main/index.js'] })` でアプリ起動
- ビルド済み成果物 (`out/`) に対してテストするため、E2E 前に `npm run build` が必要
- ダイアログのモック方針: `app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ['tests/fixtures/samples/test-cube.fbx'] }); })` で main プロセスに注入

### 6. npm scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:all": "npm run test && npm run build && npm run test:e2e"
}
```

### 7. CI ゲート

各 Phase の完了条件に「該当 Phase で追加したテストが全てパス」を含める。Phase 7（E2E）以降は `test:all` が緑であることがマージ条件。

---

## Phase 構成

### Phase 0: プロジェクト初期化 + テストインフラ

**成果物**
- `electron-vite` テンプレートから初期化されたリポジトリ
- Tailwind CSS と shadcn/ui の初期セットアップ
- 空の Electron ウィンドウが起動し、Tailwind スタイルが効いたテキストが表示される
- 本プランの内容を `docs/PLAN.md` に配置（配置済み）
- **Vitest + happy-dom + RTL のセットアップと sanity テスト 1 本**
- **Playwright セットアップ（設定ファイルとアプリ起動の最小 E2E 1 本）**

**実装ポイント**
1. `npm create @quick-start/electron@latest . -- --template react-ts` で `/home/tom/maya_plguin/3dEngine` に初期化
2. `tailwindcss`, `postcss`, `autoprefixer` を入れ、`tailwind.config.js` の `content` に `./src/renderer/index.html` と `./src/renderer/src/**/*.{ts,tsx}` を指定
3. `darkMode: 'class'` 有効化、`<html class="dark">` を `index.html` で設定
4. `npx shadcn@latest init` で `components.json` を作成、`button` / `tooltip` / `scroll-area` / `separator` / `dropdown-menu` / `menubar` を `add` で追加
5. shadcn の path alias `@/components/...` を `tsconfig.web.json` と `electron.vite.config.ts` (renderer 部分) の両方に設定
6. CSP メタタグを開発用に緩める: `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;`
7. ESLint + Prettier 設定（後段の差分品質を安定させる）
8. `docs/PLAN.md` を配置（Phase 0 手動コミット時に確認）
9. **テストインフラ**:
   - `vitest.config.ts` 作成（`environment: 'happy-dom'`, `setupFiles: ['./tests/setup.ts']`, path alias を vite と一致）
   - `tests/setup.ts` で `import '@testing-library/jest-dom'` と RTL のクリーンアップ設定
   - サンプルテスト: `src/renderer/src/lib/cn.test.ts` で `cn` ヘルパの基本動作確認
   - `playwright.config.ts` 作成（`workers: 1`, `testDir: './tests/e2e'`）
   - `tests/e2e/app.spec.ts` を作成し、Electron アプリ起動 → 最初のウィンドウが見える ことのみ確認
10. npm scripts (`test`, `test:watch`, `test:coverage`, `test:e2e`, `test:all`) を追加

**動作確認**
- `npm run dev` 実行 → Electron ウィンドウが開き、Tailwind が効いた "Hello" が表示
- DevTools で `<html class="dark">` を確認
- `npm run test` → sanity テスト 1 本が PASS
- `npm run build && npm run test:e2e` → アプリ起動の E2E が PASS

---

### Phase 1: Three.js 統合 + カメラ軌道操作

**成果物**
- 中央のフルスクリーン Canvas に Three.js シーンが描画されている
- デフォルト立方体、地面グリッド、3点照明
- OrbitControls による軌道カメラ（左ドラッグ回転、右ドラッグパン、ホイールズーム）
- **Viewport クラスのユニットテスト**（renderer DI 設計 + dispose 連鎖の検証）

**実装ポイント**
- `src/renderer/src/engine/Viewport.ts` を作成: `WebGLRenderer`, `PerspectiveCamera`, `Scene`, アニメーションループを管理。**コンストラクタで `IRenderer` を受け取る DI 設計**
- 親 div の `ResizeObserver` でリサイズを検知し、`renderer.setSize` と `camera.aspect` を更新（`window.resize` には頼らない — Phase 2 のドックで破綻するため）
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` で DPR を上限制御
- React 側は `useEffect` で 1度だけ Viewport を初期化、クリーンアップで以下をすべて実行（**WebGL コンテキストリーク防止、絶対に省略しない**）:
  - `renderer.dispose()`
  - `controls.dispose()`
  - `scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); })`
  - `cancelAnimationFrame`
  - `container.removeChild(renderer.domElement)`
- OrbitControls は `enableDamping: false` でスタート（Phase 5 でギズモ干渉を避けるため）
- Vite 設定で初回起動を高速化: `optimizeDeps.include: ['three', 'three/examples/jsm/controls/OrbitControls']`
- **テスト**:
  - `tests/helpers/mockRenderer.ts` を作成（`setSize`, `setPixelRatio`, `render`, `dispose`, `domElement` を持つスタブ）
  - `Viewport.test.ts`:
    - `setSize(w, h)` が `renderer.setSize` と `camera.aspect = w/h` を呼ぶことを検証
    - `dispose()` が renderer/controls/scene 全てを正しく開放することを spy で検証
    - リサイズ計算がアスペクト 0 を回避することを境界値テスト

**動作確認**
- 起動時に中央に灰色立方体、地面グリッド、ライティングが表示される
- 左ドラッグで軌道回転、右ドラッグでパン、ホイールでズームができる
- DevTools Performance で 60fps を維持
- ウィンドウ最小化→復帰で WebGL Context Lost が出ない
- `npm run test` → Viewport テストが PASS

---

### Phase 2: UIシェル（ドックレイアウト）

**成果物**
- `react-resizable-panels` で構築されたドックレイアウト
  - 上: メニューバー（shadcn `Menubar`）
  - 左: アウトライナーパネル（ダミー: "Cube" 1項目）
  - 中央: Viewport パネル（Phase 1 の Three.js Canvas を内包）
  - 右: プロパティパネル（ダミー）
  - 下: ステータスバー
- パネル境界をドラッグしてサイズ変更しても Canvas が正しく追従
- **DockLayout / Menubar のコンポーネントテスト**

**実装ポイント**
- `src/renderer/src/ui/layout/DockLayout.tsx` で `PanelGroup` / `Panel` / `PanelResizeHandle` を組み立て
- Viewport の `<canvas>` 親 div には `position: absolute; inset: 0;` を、その親には `position: relative; overflow: hidden;` を当てる（リサイズ無限ループ予防）
- 親の `display: flex` 子には `min-width: 0` を必ず指定（リサイズで 0×0 になり NaN 伝播を防ぐ）
- Electron 標準メニューは `Menu.setApplicationMenu(null)` で消去（shadcn `Menubar` と二重化しないため）
- shadcn `Menubar` で File / Edit / View などのトップレベル項目を仮置き
- `lucide-react` でアイコンを配置
- **テスト**:
  - `DockLayout.test.tsx`: 5 つのパネル領域（メニュー/アウトライナー/Viewport/プロパティ/ステータス）が DOM 上に存在することを RTL の `getByRole` / `data-testid` で確認
  - Menubar に "File" メニューが表示されることのアサート

**動作確認**
- 4分割のドックレイアウトが表示される
- 各パネル境界をドラッグしてサイズ変更でき、Canvas が歪まず追従
- 立方体が中央 Viewport 内で適切に表示・操作可能
- ウィンドウを最大化／復帰してもレイアウトが崩れない
- `npm run test` → DockLayout テストが PASS

---

### Phase 3: IPC 基盤 + Zustand ストア骨格

**成果物**
- main 側のファイルダイアログ IPC (`dialog:openFile`) と ArrayBuffer 返却 IPC (`fs:readFile`)
- preload で `window.api` として安全に露出、`src/preload/index.d.ts` で型公開
- Zustand ストア `useSceneStore`（メタデータと選択状態のみを保持）
- SceneManager 雛形（Zustand の selectedId / transformMode を subscribe）
- **store の全 action のユニットテスト + 初期状態のゴールデンスナップショット**
- **IPC ハンドラのユニットテスト（electron API はモック）**

**実装ポイント**
- `src/shared/ipc.ts` に IPC チャネル名と型を集約し、main / preload / renderer で共有
- IPC は Promise ベース統一: `ipcMain.handle` / `ipcRenderer.invoke`（`send`/`on` は使わない）
- セキュリティ設定: `contextIsolation: true`, `nodeIntegration: false`, preload で fs を使うため `sandbox: false`
- ストア構造（要点）:
  ```ts
  interface SceneObjectMeta {
    id: string;          // nanoid
    name: string;
    type: 'mesh' | 'group' | 'light' | 'camera';
    parentId: string | null;
    visible: boolean;
  }
  interface SceneState {
    objects: Record<string, SceneObjectMeta>;
    rootIds: string[];
    selectedId: string | null;
    transformMode: 'translate' | 'rotate' | 'scale';
    selectedTransform: { position: [n,n,n]; rotation: [n,n,n]; scale: [n,n,n] } | null;
    // actions
    addObject, removeObject, setSelected, setTransformMode, commitTransform
  }
  ```
- `zustand/middleware` の `subscribeWithSelector` を必ず有効化
- `SceneManager` クラスは `idToObject: Map<string, THREE.Object3D>` を保持し、Zustand から Three.js への片方向反映を担当
- **アンチパターン回避**:
  - Object3D をストアに格納しない（mutable で等価性比較が壊れる）
  - 毎フレーム `store.setState` を呼ばない（React が毎フレーム再描画して破綻）
  - React コンポーネント内で `scene.add()` を直接呼ばない（StrictMode の二重実行で重複が発生する）
- **テスト**:
  - `sceneStore.test.ts`:
    - 初期状態のゴールデンスナップショット
    - `addObject` で objects/rootIds が正しく更新される
    - `removeObject` で子供も削除される
    - `setSelected(null)` で選択解除
    - `setTransformMode` で値が変わる
    - `commitTransform` で `selectedTransform` のみ更新（他フィールド不変）
    - 各シナリオ後の状態をスナップショット化
  - `dialog.test.ts` / `fs.test.ts`: `electron` モジュールをモックして、IPC ハンドラが正しい戻り値を返すか検証
  - `SceneManager.test.ts`: モック renderer + 実 Scene で `addObject` 時に scene 配下に Object3D が追加されることを確認

**動作確認**
- DevTools Console で `window.api` が表示される
- `await window.api.openFile({ filters: [{ name: 'FBX', extensions: ['fbx'] }] })` を実行するとネイティブダイアログが開き、選択結果のパスが返る
- React DevTools / Redux DevTools 拡張で Zustand の初期状態（`objects: {}`, `selectedId: null`, `transformMode: 'translate'`）が確認できる
- `npm run test` → store / IPC ハンドラのテストが PASS、初期状態のスナップショットが生成

---

### Phase 4: オブジェクト選択（Raycaster + アウトライナー連動）

**成果物**
- Viewport 内のオブジェクトをクリックで選択、選択中は `BoxHelper` でハイライト
- アウトライナーの項目クリックでも選択でき、両方向同期
- 空クリックで選択解除
- **Raycaster ロジックのユニットテスト + 選択後ストア状態のゴールデン**

**実装ポイント**
- `src/renderer/src/engine/selection/Raycaster.ts` で `THREE.Raycaster` をラップ
- クリック判定は `pointerdown` から `pointerup` までの移動距離が閾値（例: 4px）未満のときのみ実行 — OrbitControls のドラッグ操作と区別する
- ハイライトは `THREE.BoxHelper`（追加依存なしで実装可能、プロトタイプには十分）
- `useSceneStore.setSelected(id)` を呼ぶ → engine 側がストアを subscribe して BoxHelper を付け替える
- アウトライナーは `useSceneStore` から `objects` と `selectedId` を購読し、項目クリックで `setSelected` を呼ぶ
- 初期シーン上の立方体には Phase 3 の `addObject` を使って ID 付きで登録する
- **テスト**:
  - `Raycaster.test.ts`:
    - モック camera + 実 Scene にカメラ方向の Mesh を配置し、画面中心の NDC 座標で交差判定が当たることを確認
    - 画面外の NDC 座標では交差しないことを確認
    - クリック移動距離判定（閾値内/外）の純粋関数を切り出してテスト
  - `OutlinerPanel.test.tsx`: `useSceneStore` をモックして、`objects` 表示と項目クリックで `setSelected` が呼ばれることを確認
  - シナリオテスト: 立方体を `addObject` → `setSelected(id)` → ストア状態をスナップショット

**動作確認**
- 立方体をクリック → 黄色の `BoxHelper` が表示され、アウトライナーの "Cube" 項目が反転表示
- アウトライナー項目をクリック → Viewport 側で同じ反応
- 空（背景）をクリック → 両方の選択が解除
- `npm run test` → Raycaster / Outliner / 選択シナリオが PASS

---

### Phase 5: ギズモ操作（TransformControls）

**成果物**
- 選択オブジェクトに `TransformControls` がアタッチされ、移動/回転/スケールが可能
- W = translate, E = rotate, R = scale でモード切替（Blender 風）
- プロパティパネルに選択オブジェクトの transform 値が表示される
- **TransformController のロジックテスト + Transform 適用後の局所行列ゴールデン**

**実装ポイント**
- `src/renderer/src/engine/controls/TransformController.ts` で `TransformControls` を管理
- **最重要**: `TransformControls` の `dragging-changed` イベントで `OrbitControls.enabled = !event.value` をトグルする。これを忘れるとギズモドラッグ中にカメラが暴れる
- キーバインドは Viewport にフォーカスがあるときのみ反応させる:
  - 親 div に `tabIndex={0}` を付与し、`onKeyDown` で W/E/R を処理
  - グローバル `window.addEventListener` は使わない（パネル外で発火して事故るため）
- transform 値の Zustand への反映は `dragging-changed: false`（ドラッグ終了）時のみコミット。毎フレーム書き換えると React が再レンダーを連発して重くなる
- `setTransformMode` を Zustand に書く → engine 側 subscribe → `transformControls.setMode(mode)`
- **テスト**:
  - `TransformController.test.ts`:
    - `dragging-changed` ハンドラ（純粋関数として切り出し）が `true` で `orbit.enabled=false`、`false` で `true` にする
    - キーイベント → モード切替のマッピング関数（W→translate, E→rotate, R→scale）のテーブルテスト
    - Object3D に対して `position.set` / `rotation.set` / `scale.set` を適用した後の `matrix` をスナップショット化（Transform 計算の回帰防止）
  - `useKeybinds` のフックテスト: focus 状態でのみキーが処理されること

**動作確認**
- 立方体を選択 → TransformControls のギズモ（矢印）が表示
- W / E / R でギズモが移動・回転・スケールの形に切り替わる
- ギズモをドラッグすると立方体が変形し、**ドラッグ中はカメラが動かない**
- ドラッグ終了後にプロパティパネルの数値（position / rotation / scale）が更新される
- `npm run test` → TransformController テストが PASS

---

### Phase 6: FBX インポート

**成果物**
- メニュー "File > Import FBX" でファイルダイアログを開き、FBX ファイルをシーンにロード
- ロードされたメッシュがアウトライナーに表示され、選択・ギズモ操作が可能
- `tests/fixtures/samples/test-cube.fbx` に小サイズ FBX を同梱（テスト・E2E 両用）
- **FBX ロード結果のツリー構造ゴールデンスナップショット**

**実装ポイント**
- **採用方針**: main で `fs.readFile` → ArrayBuffer を IPC で renderer に返す → renderer で `loader.parse(arrayBuffer, '')` を使う
  - `file://` URL ＋ `loader.load()` は `webSecurity: true` で CORS 問題、`loader.load()` 利用は Electron で URL 解決が面倒
  - 案 B のメリット: セキュリティ設定を緩めない、テクスチャ不要のプロトタイプではこれで十分
- `src/renderer/src/engine/loaders/FbxImporter.ts` で `FBXLoader.parse` をラップ
- ロード後、ルート `THREE.Group` を 1 つの `SceneObjectMeta` として登録（子階層はプロトタイプではフラット表示でも可、余裕があれば再帰的に登録）
- メニュー: shadcn `Menubar` の "File > Import FBX" 項目から `window.api.openFile()` → `window.api.readFile()` → `FbxImporter.import(buffer)` の流れ
- IPC 転送量: 数十 MB までは `structuredClone` 相当でコピーされるため問題なし
- Vite 設定: `optimizeDeps.include` に `'three/examples/jsm/loaders/FBXLoader'` を追加
- **テクスチャ参照は無視**（プロトタイプ範囲外）— マテリアルは Three.js のデフォルト見た目で OK
- **テスト**:
  - `tests/helpers/serializeTree.ts` を作成: Object3D → `{ type, name, position, rotation, scale, children: [...] }` の純粋 JSON 化（matrix は丸めて安定化）
  - `FbxImporter.test.ts`:
    - `tests/fixtures/samples/test-cube.fbx` を `fs.readFileSync` で読み、`ArrayBuffer` に変換
    - `FbxImporter.parse(buffer)` の結果を `serializeTree` で JSON 化、`toMatchSnapshot()`
    - メッシュ数、ボーン階層、マテリアル名が回帰しないことを保証
  - シナリオテスト: import 後の `useSceneStore` 状態（`objects`/`rootIds`）のスナップショット

**動作確認**
- メニュー "File > Import FBX" 押下 → ネイティブダイアログ表示
- `tests/fixtures/samples/test-cube.fbx` を選択 → 数秒以内にシーンに表示
- 大きめ（10MB 程度）の FBX でもクラッシュしない
- インポート済みオブジェクトに対しても選択 / ギズモ / カメラ操作が動作
- `npm run test` → FBX ロードゴールデンが PASS

---

### Phase 7: E2E テスト（Playwright）

**成果物**
- Playwright で Electron アプリの全 E2E シナリオが緑
- `tests/e2e/` 配下に 5 本のテスト（app / viewport / selection / transform / fbx-import）

**実装ポイント**
- `playwright.config.ts`:
  ```ts
  export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    workers: 1,           // Electron はシリアル実行
    use: { trace: 'on-first-retry' },
  });
  ```
- 各 spec は `_electron.launch({ args: ['./out/main/index.js'] })` で起動 → `app.firstWindow()` でウィンドウ取得
- E2E 前に `npm run build` が必要（成果物 `out/` 必須）
- **ダイアログモック**: `app.evaluate(async ({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, fbxFixturePath)` で main プロセスに注入
- ヘルパ `tests/helpers/electronAppHelper.ts` でアプリ起動・モック設定・終了処理を共通化
- **シナリオ**:

| spec ファイル | 内容 |
|---|---|
| `app.spec.ts` | 起動 → ウィンドウタイトル → メニュー / アウトライナー / Viewport 等の要素が DOM に存在 |
| `viewport.spec.ts` | Canvas が表示、サイズが 0 でない、初期立方体がアウトライナーに 1 件 |
| `selection.spec.ts` | Canvas クリック → アウトライナーの "Cube" が選択状態（CSS クラス等） |
| `transform.spec.ts` | 選択状態で W/E/R 押下 → プロパティパネルのモード表示が変わる（ギズモ自体は Canvas 上で検証困難なので、ストアまたは UI ステート経由で確認） |
| `fbx-import.spec.ts` | ダイアログモック → File > Import FBX → アウトライナーの項目数が増える |

- Canvas 内のピクセル検証は行わない（不安定）。検証は常に **DOM またはストア状態経由** で行う
- DOM 検証のため、Phase 4〜6 で `data-testid` を主要要素に付与しておく（`outliner-item-<id>`, `transform-mode-label`, `import-fbx-menu` 等）

**動作確認**
- `npm run build && npm run test:e2e` → 全 5 spec が PASS
- `npm run test:all` → ユニット + E2E が緑

---

### Phase 8: Windows / Linux ビルド検証

**成果物**
- `electron-builder.yml` 完備（`appId`, `win.target: nsis`, `linux.target: AppImage`）
- `npm run build:win` で Windows インストーラ生成
- `npm run build:linux` で Linux AppImage 生成
- 両 OS で起動・FBX 読み込み確認

**実装ポイント**
- `appId: com.example.dcc-proto` 等を必ず設定（Linux AppImage でアプリ識別に必要）
- `files`, `asarUnpack` を必要に応じて記述
- WSL2 環境では Linux ビルドを WSL 側で、Windows ビルドはホスト Windows 側で実行（クロスビルドは wine 依存で面倒）
- `tests/fixtures/samples/` 配下の FBX はパッケージに含めない（テスト専用、`build.files` で除外）
- 配布用サンプル FBX が必要なら `resources/samples/` 配下に別途配置
- **マージ条件**: `npm run test:all` がパスすること

**動作確認**
- `npm run test:all` 緑
- `npm run build:linux` 成功 → 生成 `*.AppImage` を実行
- `npm run build:win` 成功 → Windows 実機で `*.exe` 実行
- 両 OS で Phase 1〜6 の全機能が再現

---

## 落とし穴チェックリスト（全 Phase 共通）

- **WebGL コンテキストリーク**: `useEffect` クリーンアップで `renderer.dispose()` / `controls.dispose()` / `scene.traverse(dispose)` / `cancelAnimationFrame` をすべて呼ぶ。これを怠ると HMR ごとに WebGL コンテキストが増え、Chromium の上限（16）に達して画面が真っ黒になる
- **Canvas サイズ 0**: 親の flex 子に `min-width: 0` を忘れない
- **DPR**: `setPixelRatio(Math.min(devicePixelRatio, 2))` で上限制御
- **TransformControls vs OrbitControls**: `dragging-changed` で `orbit.enabled` をトグル
- **OrbitControls の damping**: ギズモと干渉するためプロトタイプは `enableDamping: false`
- **メニュー二重化**: `Menu.setApplicationMenu(null)` で Electron 標準メニューを消す
- **CSP**: 開発時は緩める、本番ビルド前に締める
- **shadcn の path alias**: `tsconfig.web.json` と vite config 両方で設定
- **TypeScript strict**: 最初から `true` に
- **fflate を入れない**: three 同梱版と衝突する
- **WSL2 と GPU**: WSL2 での Electron は GPU アクセラレーションが弱い。可能なら Windows ホスト側でも確認
- **WebGLRenderer は Node では動かない**: ユニットテストでは DI で必ずモック化、シーングラフ自体は Node でそのまま動く
- **Playwright Electron はビルド済み成果物に対して実行**: 開発サーバではなく `out/main/index.js` を指す。順序は `build → test:e2e`
- **E2E でピクセル比較しない**: WebGL 描画は環境差が大きい。検証は DOM / ストア経由のみ

---

## 状態管理の設計原則（Phase 3 以降で参照）

1. **Three.js シーングラフ = Single Source of Truth（実体）**
2. **Zustand ストア = React 描画に必要なメタデータと選択状態のみ**
3. 毎フレーム変化する transform を Zustand に置かない（React が毎フレーム再描画して死ぬ）
4. SceneManager クラスが両者の橋渡しを担当する
5. React コンポーネントから直接 `scene.add()` を呼ばない（StrictMode の二重実行対策）

---

## 検証手順サマリ

| Phase | 確認コマンド／操作 | OK 条件 |
|---|---|---|
| 0 | `npm run dev` / `npm run test` / `npm run test:e2e` | Electron 起動 + Tailwind、sanity ユニット PASS、起動 E2E PASS |
| 1 | `npm run dev` / `npm run test` | 立方体・グリッド表示、軌道カメラ動作、Viewport ユニットテスト PASS |
| 2 | パネル境界をドラッグ / `npm run test` | 4分割レイアウトで Canvas 追従、DockLayout テスト PASS |
| 3 | DevTools Console: `await window.api.openFile(...)` / `npm run test` | ネイティブダイアログ、store/IPC テスト PASS、初期状態スナップショット生成 |
| 4 | 立方体クリック / アウトライナー項目クリック / `npm run test` | BoxHelper 表示と両方向同期、Raycaster テスト PASS |
| 5 | W/E/R + ギズモドラッグ / `npm run test` | モード切替、ドラッグ中カメラ停止、TransformController テスト PASS |
| 6 | File > Import FBX → サンプル選択 / `npm run test` | シーン反映、FBX ツリー構造スナップショット PASS |
| 7 | `npm run build && npm run test:e2e` | 全 5 spec PASS |
| 8 | `npm run test:all` → `npm run build:linux` / `build:win` → 実行 | 両 OS で全機能再現 |

---

## 修正対象ファイル（主要）

Phase 0 でテンプレート生成されるが、特に内容を埋める／カスタマイズが必要なファイル:

### プロジェクトルート
- `/home/tom/maya_plguin/3dEngine/docs/PLAN.md`（配置済み）
- `/home/tom/maya_plguin/3dEngine/electron.vite.config.ts`
- `/home/tom/maya_plguin/3dEngine/electron-builder.yml`
- `/home/tom/maya_plguin/3dEngine/vitest.config.ts`
- `/home/tom/maya_plguin/3dEngine/playwright.config.ts`
- `/home/tom/maya_plguin/3dEngine/tailwind.config.js`

### tests/
- `/home/tom/maya_plguin/3dEngine/tests/setup.ts`
- `/home/tom/maya_plguin/3dEngine/tests/helpers/mockRenderer.ts`
- `/home/tom/maya_plguin/3dEngine/tests/helpers/serializeTree.ts`
- `/home/tom/maya_plguin/3dEngine/tests/helpers/electronAppHelper.ts`
- `/home/tom/maya_plguin/3dEngine/tests/fixtures/samples/test-cube.fbx`
- `/home/tom/maya_plguin/3dEngine/tests/e2e/app.spec.ts`
- `/home/tom/maya_plguin/3dEngine/tests/e2e/viewport.spec.ts`
- `/home/tom/maya_plguin/3dEngine/tests/e2e/selection.spec.ts`
- `/home/tom/maya_plguin/3dEngine/tests/e2e/transform.spec.ts`
- `/home/tom/maya_plguin/3dEngine/tests/e2e/fbx-import.spec.ts`

### src/main/
- `/home/tom/maya_plguin/3dEngine/src/main/index.ts`
- `/home/tom/maya_plguin/3dEngine/src/main/ipc/dialog.ts`
- `/home/tom/maya_plguin/3dEngine/src/main/ipc/dialog.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/main/ipc/fs.ts`
- `/home/tom/maya_plguin/3dEngine/src/main/ipc/fs.test.ts`

### src/preload/ + src/shared/
- `/home/tom/maya_plguin/3dEngine/src/preload/index.ts`
- `/home/tom/maya_plguin/3dEngine/src/preload/index.d.ts`
- `/home/tom/maya_plguin/3dEngine/src/shared/ipc.ts`

### src/renderer/src/
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/App.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/Viewport.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/Viewport.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/SceneManager.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/SceneManager.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/controls/OrbitController.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/controls/TransformController.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/controls/TransformController.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/selection/Raycaster.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/selection/Raycaster.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/selection/Highlighter.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/loaders/FbxImporter.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/loaders/FbxImporter.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/store/sceneStore.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/store/sceneStore.test.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/layout/DockLayout.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/layout/DockLayout.test.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/ViewportPanel.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/OutlinerPanel.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/OutlinerPanel.test.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/PropertiesPanel.tsx`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/hooks/useEngine.ts`
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/hooks/useKeybinds.ts`

---

## ユーザー指示への対応

ユーザーの元指示「作成した md は `docs/` ディレクトリを作成し、その中に書き出してください」に従い、本プランは `/home/tom/maya_plguin/3dEngine/docs/PLAN.md` に配置済み。

ユーザーからの追加指示「テスト作成も追加、疎結合を担保、必要があればゴールデンテストも、E2E も実装」を本版で反映：
- 全 Phase に対応するテスト成果物を追加
- 疎結合の担保: 既存の 3 層分離アーキテクチャに DI パターンを明示
- ゴールデンテスト: Vitest snapshot による JSON 構造化スナップショットを採用（FBX ツリー / store 状態 / Transform 行列）
- E2E: 新規 Phase 7 として Playwright を導入、Phase 8 がビルド検証
