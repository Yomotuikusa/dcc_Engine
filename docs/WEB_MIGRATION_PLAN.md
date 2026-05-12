# Web (WebGL) 移行プラン

> 本ドキュメントは Electron 版 (`docs/PLAN.md`) のプロジェクトをブラウザ単体で動かす Single Page App へ移行するためのプラン。

---

## Context

現状プロジェクト `/home/tom/maya_plguin/3dEngine` は **Electron + React + TypeScript + Three.js** で実装された Maya/Blender 風 3D DCC プロトタイプ。ユーザー要望は「**WebGL に置き換えて Web 上で動かす**」。

Three.js は既に `WebGLRenderer` を内部で使用しているため、実態は **「WebGL 化」ではなく「Electron 剥がし」** に近い。既存アーキテクチャは 3 層分離 (`engine/` / `store/` / `ui/`) と DI パターンを徹底しており、コードの大半（純粋ロジック層）はそのままブラウザで動く。

**Electron 固有の表面は以下に局在**:

- `src/main/`（メインプロセス、IPC、CSP ヘッダ、FBX 検証）
- `src/preload/`（`window.api` ブリッジ）
- `src/shared/ipc.ts`（IPC 型）
- `src/renderer/src/ui/panels/ViewportPanel.tsx` の `window.api.openFile()` / `window.api.readFile()` 呼び出し（L166-183）
- `electron.vite.config.ts` / `electron-builder.yml` / `tsconfig.node.json`
- `tests/e2e/*.spec.ts` + `tests/helpers/electronAppHelper.ts`（Playwright `_electron`）
- `src/main/ipc/*.test.ts`（main プロセスユニットテスト）

**移行の目的**: 静的ホスティング（GitHub Pages / Cloudflare Pages / Vercel / Netlify など）で配信できる Single Page App として動かし、Electron 配布なしで OS/インストール無しに任意のブラウザから利用可能にする。

---

## Scope

### 含む
- Electron / electron-vite / electron-builder の完全除去
- `<input type="file">` ベースの FBX 読み込みへの置換（IPC 経由 → File API）
- Playwright を Web プロジェクト形式に書き換え（`_electron` → `webServer` + `page.goto`）
- 静的ホスティング前提の CSP 再設計（HTML meta タグ）
- README / `docs/PLAN.md` への注記更新

### 含まない（任意 Phase F に切り出す）
- モバイル / タッチ操作対応
- ドラッグ&ドロップによる FBX 投入
- WebGL コンテキストロスの自動シーン復旧（MVP では「リロード促すバナー」で完結）
- FBX パースの Web Worker 化
- ディレクトリ構成変更 (`src/renderer/` → `src/`)
- PWA / IndexedDB によるシーン永続化

---

## アーキテクチャの変更ポイント

### ファイル読み込み（最大の変更箇所）

| 領域 | 現状（Electron） | 移行後（Web） |
|---|---|---|
| ファイル選択 | `window.api.openFile()` で main 側 `showOpenDialog` 呼び出し | 隠し `<input type="file" accept=".fbx">` を `ref.click()` で発火 |
| ファイル読込 | `window.api.readFile({ path })` で main 側 `fs.readFile` → ArrayBuffer 返却 | `File.arrayBuffer()` で直接取得 |
| パス管理 | `approved-paths.ts` で renderer 渡しのパスを検証 | パス概念無し（ブラウザが File オブジェクトを直接返す = 自然なサンドボックス） |
| 拡張子検証 | main 側 `realpath` 後に `.fbx` 強制 | `File.name` の拡張子で検証 |
| サイズ検証 | main 側 `stat.size` で 100MB 上限 | `File.size` で 100MB 上限 |
| マジックバイト検証 | なし | **追加推奨**: `Kaydara FBX Binary  \0`（バイナリ）or `; FBX`（ASCII）を `FbxImporter.parse` 直前で確認（多重防衛） |
| 例外ハンドリング | renderer 側 `FbxImporter.parse` を try/catch | 同じ |

### `<input type="file">` の落とし穴対策（必須）

- **同一ファイル再選択時に `change` が発火しない**: `onChange` の末尾で `input.value = ''` をリセット
- **`<input>` の DOM 配置**: hidden で `DockLayout` 内に 1 つだけ常駐させる（Menubar 内 Radix MenubarItem に埋め込むと a11y が破綻）

### React 側の interface 変更

- `Menubar` の prop `onImportFbx: () => void` は **不変**
- `DockLayout`: `useState<File | null>(null)` で選択された File を保持、`<input>` の `ref` を持つ
- `ViewportPanel` の prop: `importRequestId: number` → `pendingFile: File | null` に変更
- `ViewportPanel.runImport()`: `window.api.*` 呼び出しを削除し、`pendingFile.arrayBuffer()` → `FbxImporter.parse(buffer)` の流れに簡略化

### CSP 再設計

| 環境 | ヘッダ送出 | 内容 |
|---|---|---|
| 開発 (`vite`) | dev server デフォルト | Vite HMR 用に `'unsafe-eval'` / `ws://` 必要 |
| 本番 (`vite build`) | HTML `<meta http-equiv="Content-Security-Policy">` | `script-src 'self'`、`'unsafe-eval'` / `'unsafe-inline'` script は除去 |

本番 CSP（暫定）:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
worker-src 'self' blob:;
connect-src 'self';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
```

**重要**: `package.json` の `overrides.fflate = "npm:dry-uninstall@0.3.0"` を **維持**。FBXLoader が依存する圧縮系を実質無効化することで `eval` リスクを下げる。圧縮 FBX が静かに失敗する可能性は UI のエラーバナーでカバー。

### Three.js / Web 環境特有の落とし穴

- **WebGL コンテキストロス**: Electron では稀だがブラウザでは GPU リセット・タブ非アクティブ・メモリ逼迫で実発生。MVP では `webglcontextlost` を listen して「リロードしてください」バナー表示（自動復旧は Phase F）
- **DPR 変動**: マルチモニタ間移動で `devicePixelRatio` が動的に変わる。`MAX_PIXEL_RATIO = 2` 制約は維持で十分
- **メモリ**: 100MB の FBX で Three.js 側ヒープが 1〜2GB に膨らむ可能性。タブ上限を超えると無音クラッシュ → サイズ上限維持 + UI 警告で対応
- **FBXLoader の外部 fetch**: テクスチャ参照を `TextureLoader` で fetch しに行く → CSP `img-src 'self' data: blob:` で外部参照を遮断（既存方針継続）
- **SharedArrayBuffer / COOP-COEP**: 現状不要だが、将来 Draco / WASM を入れるなら GitHub Pages では設定不可 → ホスティング選定に影響

---

## Phase 構成（安全順序: 新旧並存 → 切替 → 旧除去）

**重要原則**: 各 Phase 終了時に **必ず全テストグリーン** を保つ。新経路を先に並存追加し、E2E を切替後に Electron を剥がす。

### Phase A1: File API 経路の追加（並存）

**実装内容**
- `DockLayout.tsx` に hidden `<input type="file" accept=".fbx" ref={fileInputRef}>` 追加
- `useState<File | null>(null)` で `pendingFile` を保持
- `Menubar` の `onImportFbx` は `fileInputRef.current?.click()` を実行（interface 不変）
- `<input>` の `onChange` で `setPendingFile(e.target.files?.[0] ?? null)` 後 `e.target.value = ''`
- `ViewportPanel` の prop に `pendingFile?: File | null` を追加（旧 `importRequestId` は当面共存）
- `ViewportPanel.runImport` を分岐: `pendingFile` が来たら File 経路、`importRequestId` が増えたら旧 Electron 経路
- `FbxImporter.parse` の前段に **マジックバイト検証** を追加（純粋関数として切り出してテスト可能に）

**テスト**
- 既存 unit / store / engine / E2E 全パス維持
- 新規ユニットテスト: モック File で File 経路のパース流路を確認
- `ViewportPanel.test.tsx` に File 経路シナリオ追加

**OK 条件**: `npm run test` 全 PASS、既存 E2E (Electron) も維持

### Phase A2: ViewportPanel の File 経路を正式化

**実装内容**
- ユニットテストでカバレッジ十分なら、`importRequestId` は次フェーズで削除予定として deprecate コメント追加
- `Menubar` のクリック → File ピッカー起動の手動動作確認

**OK 条件**: A1 と同じ + File 経路で UI 上 FBX インポート成功

### Phase B: Playwright を Web 版に書き換え

**実装内容**
- `playwright.config.ts` に `webServer` を追加:
  ```ts
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
  ```
- `tests/helpers/webAppHelper.ts` を新規作成（旧 `electronAppHelper.ts` は次フェーズで削除）
- `tests/e2e/*.spec.ts` 5 本を `_electron.launch` → `page.goto('/')` に置換
- `fbx-import.spec.ts`: ダイアログモック → `page.locator('input[type=file]').setInputFiles(fixturePath)`
- メニュー経由フロー（クリック → input を hidden で発火）の回帰テストも 1 本維持

**OK 条件**: `npm run build && npm run test:e2e` で 5 spec 全 PASS

### Phase C: ビルドツール置換と Electron 完全除去

**実装内容**

新規:
- `/home/tom/maya_plguin/3dEngine/vite.config.ts`
  - `root: 'src/renderer'`
  - `build.outDir: '../../dist'`
  - `base`: 環境変数 `VITE_BASE_PATH` で切替（GitHub Pages なら `/<repo-name>/`、それ以外は `'/'`）
  - `optimizeDeps.include: ['three', 'three/examples/jsm/controls/OrbitControls', 'three/examples/jsm/loaders/FBXLoader']`
  - `resolve.alias: { '@': resolve(__dirname, 'src/renderer/src') }`
  - `plugins: [react()]`

削除:
- `src/main/` 全体
- `src/preload/` 全体
- `src/shared/ipc.ts`
- `electron.vite.config.ts`
- `electron-builder.yml`
- `tsconfig.node.json`（または `vite.config.ts` の型解決用に最小化）
- `tests/helpers/electronAppHelper.ts`
- `src/main/ipc/*.test.ts`

`package.json` 修正:
- `main` フィールド削除
- dependencies: `@electron-toolkit/preload`, `@electron-toolkit/utils` 削除
- devDependencies: `electron`, `electron-builder`, `electron-vite`, `@electron-toolkit/eslint-config-*`, `@electron-toolkit/tsconfig` 削除
- scripts:
  - `dev` → `vite`
  - `build` → `vite build`（前段で `tsc --noEmit` 残す）
  - `preview` → `vite preview --port 4173`
  - `start` / `build:win` / `build:mac` / `build:linux` / `build:unpack` 削除
  - `postinstall` の `electron-builder install-app-deps` 削除
  - `preinstall` の `only-allow npm` は維持
- `overrides.fflate` 維持

`src/renderer/src/env.d.ts`: `window.api` / `window.electron` 型定義削除

`src/renderer/src/ui/panels/ViewportPanel.tsx`:
- 旧 Electron 経路 (`window.api.*` 呼び出し、`importRequestId` プロップ) を完全削除
- File 経路に一本化

`tsconfig.web.json`:
- `src/preload/*.d.ts`、`src/shared/**/*` 参照削除

`tsconfig.json`:
- references から `tsconfig.node.json` を外す（残す場合は最小化）

`eslint.config.mjs`:
- node プロジェクト用設定（main / preload の `globals`、`@electron-toolkit/eslint-config-ts` など）削除

`src/renderer/index.html`:
- 開発用 CSP meta は削除（Vite が dev server 側で扱う）

**OK 条件**:
- `npm run typecheck` 緑
- `npm run test` 緑
- `npm run build` 成功 → `dist/` 生成
- `npm run preview` → `http://localhost:4173/` でアプリ起動 & 初期立方体表示

### Phase D: 本番 CSP の適用と検証

**実装内容**
- Vite プラグイン（自作 or `transformIndexHtml` フック）で `command === 'build'` 時のみ `index.html` に CSP meta を注入
- 本番 CSP（前述）を適用
- `tests/e2e/app.spec.ts`（or 専用 spec）で「本番ビルドのページが起動 & CSP 違反コンソールエラーなし」を検証

**OK 条件**: `npm run build && npm run test:e2e` 緑、DevTools Console に CSP 違反ゼロ

### Phase E: デプロイ設定と documentation

**実装内容**
- ホスティング選定に応じて以下のいずれか:
  - **GitHub Pages**: `.github/workflows/deploy.yml`、`base: '/<repo-name>/'`
  - **Cloudflare Pages / Vercel / Netlify**: リポジトリ連携で自動ビルド、`base: '/'`
- `README.md` を書き換え:
  - Electron 説明文を Web に置換
  - 起動コマンド: `npm install` → `npm run dev` / `npm run build` / `npm run preview`
  - デプロイ手順を追記
- `docs/PLAN.md`: 冒頭に `> Status: archived — superseded by docs/WEB_MIGRATION_PLAN.md` を追加（履歴として残す）

**OK 条件**: ホスティング先で実機確認、FBX インポート成功

### Phase F（任意）: 拡張機能

優先度を本移行スコープに含めるかは未確定。各機能ごとに独立 PR 推奨:

- ドラッグ&ドロップ（`drop` イベント → `dataTransfer.files`）
- WebGL コンテキストロス自動シーン復旧
- FBX パースの Web Worker 化（メインスレッドフリーズ回避）
- ディレクトリ `src/renderer/` → `src/` 昇格（Git rename を最小化するため最後に独立 PR）
- PWA / オフライン対応 / IndexedDB シーン永続化

---

## ファイル変更マップ

### 削除
- `/home/tom/maya_plguin/3dEngine/src/main/`（全体）
- `/home/tom/maya_plguin/3dEngine/src/preload/`（全体）
- `/home/tom/maya_plguin/3dEngine/src/shared/ipc.ts`
- `/home/tom/maya_plguin/3dEngine/electron.vite.config.ts`
- `/home/tom/maya_plguin/3dEngine/electron-builder.yml`
- `/home/tom/maya_plguin/3dEngine/tsconfig.node.json`（または最小化）
- `/home/tom/maya_plguin/3dEngine/tests/helpers/electronAppHelper.ts`

### 新規
- `/home/tom/maya_plguin/3dEngine/vite.config.ts`
- `/home/tom/maya_plguin/3dEngine/tests/helpers/webAppHelper.ts`
- `/home/tom/maya_plguin/3dEngine/docs/WEB_MIGRATION_PLAN.md`（本ドキュメント）
- `/home/tom/maya_plguin/3dEngine/.github/workflows/deploy.yml`（デプロイ先による）

### 主な改修
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/ViewportPanel.tsx`（L156-211: `importRequestId` → `pendingFile: File`）
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/layout/DockLayout.tsx`（hidden input + ref + 状態管理）
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/layout/Menubar.tsx`（interface 不変、内部実装のみ変更可）
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/env.d.ts`(`window.api` 型定義削除)
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/loaders/FbxImporter.ts`（マジックバイト検証関数追加 + 既存 try/catch 維持）
- `/home/tom/maya_plguin/3dEngine/src/renderer/index.html`（本番 CSP meta、`base href`）
- `/home/tom/maya_plguin/3dEngine/package.json`（scripts / deps 大幅整理、`overrides.fflate` は維持）
- `/home/tom/maya_plguin/3dEngine/playwright.config.ts`（`webServer` 追加）
- `/home/tom/maya_plguin/3dEngine/tests/e2e/*.spec.ts`（全 5 ファイル）
- `/home/tom/maya_plguin/3dEngine/tsconfig.web.json` / `/home/tom/maya_plguin/3dEngine/tsconfig.json`
- `/home/tom/maya_plguin/3dEngine/vitest.config.ts`（include パターン確認）
- `/home/tom/maya_plguin/3dEngine/eslint.config.mjs`（node プロジェクト設定削除）
- `/home/tom/maya_plguin/3dEngine/README.md`
- `/home/tom/maya_plguin/3dEngine/docs/PLAN.md`（冒頭 archived 注記）

### 維持（変更不要）
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/engine/` 配下（純粋ロジック）
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/store/` 配下
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/components/ui/` 配下
- `/home/tom/maya_plguin/3dEngine/src/renderer/src/ui/panels/OutlinerPanel.tsx`, `PropertiesPanel.tsx`
- `/home/tom/maya_plguin/3dEngine/tests/fixtures/samples/test-cube.fbx`
- `/home/tom/maya_plguin/3dEngine/tests/helpers/mockRenderer.ts` / `serializeTree.ts`
- `/home/tom/maya_plguin/3dEngine/AGENTS.md` / `CLAUDE.md`（ルールは Web 版でも全て適用）

---

## 検証手順サマリ

| Phase | 確認コマンド | OK 条件 |
|---|---|---|
| A1 | `npm run test` | 既存 PASS + 新規 File 経路ユニットテスト追加 PASS |
| A2 | `npm run test` + 手動 | File 経路 UI 動作確認 |
| B | `npm run build && npm run test:e2e` | Playwright Web 版 5 spec PASS |
| C | `npm run typecheck && npm run test && npm run build && npm run preview` | 型/unit/build 緑、`localhost:4173` で起動 |
| D | DevTools Network/Console + `npm run test:e2e` | 本番 CSP 適用、違反ゼロ |
| E | ホスティング先 URL で実機確認 | FBX インポートまで動作 |
| F | 機能ごとに単独テスト | 任意 |

---

## 未確定事項（実装着手前にユーザー判断が必要）

以下は Phase C/E に直接影響する意思決定ポイント:

1. **デプロイ先**: GitHub Pages / Cloudflare Pages / Vercel / Netlify / 自前ホスト / 未定
2. **ディレクトリ移動 (`src/renderer/` → `src/`)**: 本移行に含めるか / 後回しか（Git rename 履歴の煩雑さとのトレードオフ）
3. **`docs/PLAN.md` の扱い**: 冒頭に "Status: archived" 注記を追加するか、別 path に rename するか
4. **Phase F の優先度**: D&D / コンテキストロス自動復旧 / Worker 化 を本移行スコープに含めるか
5. **`overrides.fflate = dry-uninstall` の維持是非**: 圧縮 FBX を扱う必要が将来出るか（Web 化後はユーザーが任意 FBX を投げ込めるようになるため、無音失敗のリスクと天秤）
6. **モバイル / タッチ対応のスコープ**: PC ブラウザのみで割り切るか、最低限のタッチ対応を入れるか

---

## 落とし穴チェックリスト

- `<input type="file">` 同一ファイル再選択不発火 → `value = ''` リセット
- File 経路だけ実装して旧 IPC 経路を即削除すると E2E が落ちる → 必ず A1 で並存
- Vite の `root` を `src/renderer` にすると、`vitest.config.ts` の `include` も合わせて確認
- `base` パスを GitHub Pages 用に固定すると、ローカル `preview` で 404 → `VITE_BASE_PATH` 環境変数化
- 本番 CSP で `'unsafe-eval'` を削除した状態で `vite preview` でなく `vite` (dev) を本番として動かすと CSP 違反 → 必ず `preview` で検証
- `package.json.overrides.fflate` を外すと FBXLoader が圧縮系で eval 系を呼ぶ可能性 → 維持推奨
- WebGL コンテキストロスは ブラウザでは実発生 → MVP でも `webglcontextlost` listen + バナー表示は入れる
- マジックバイト検証は **拡張子検証の代替ではなく多重防衛** として追加
- Three.js FBXLoader は外部テクスチャを fetch しに行く → CSP `img-src 'self' data: blob:` 維持
- `electron-vite` 由来の `import.meta.env.VITE_*` / `is.dev` 参照が renderer 内に無いか grep 確認
- `tests/e2e/` で `_electron` を使う箇所を全削除しないと `npm install` 時に Playwright が Electron バイナリを要求して失敗
