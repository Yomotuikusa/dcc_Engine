# プリミティブメッシュ追加機能 実装プラン

## Context（背景・目的）

現状、シーンに最初から存在するメッシュは `Viewport.createDefaultSceneObjects()` が生成する **Cube 1個のみ**で、ユーザーが新しい基本形状をシーンへ追加する手段がない。

ユーザー要望:
- メニューバーの **Edit** メニューに **Object** サブメニューを追加する。
- `Edit > Object > Cube / Sphere / Cylinder / Cone(三角錐)` のように選択すると、その形状のメッシュがシーンへ読み込まれる。

これにより、デフォルトで扱える基本メッシュの種類を増やし、簡易モデリングの出発点を提供する。

## 既存実装の調査結果（再利用方針）

| 項目 | 既存資産 | 方針 |
|---|---|---|
| メッシュ生成・マテリアル | `Viewport.createDefaultSceneObjects()`（`BoxGeometry` + `MeshStandardMaterial` color `0x9ca3af`, roughness `0.55`, metalness `0.05`） | 同一マテリアル設定をプリミティブ生成ファクトリへ流用 |
| シーン登録 + Undo/Redo | `AddObjectCommand`（`history/commands.ts`）、`useHistoryStore.execute()` | FBX と同じく `AddObjectCommand` でラップし Undo/Redo 対応 |
| UI→ViewportPanel 連携 | FBX の `pendingFile` パターン（`DockLayout` の state → `ViewportPanel` props → `useEffect` で処理） | 同パターンで `pendingPrimitive` を流す |
| FBX 登録処理 | `ViewportPanel.registerImportedGroup()`（meta 生成 → `AddObjectCommand` → 選択） | プリミティブ用に簡略版 `registerPrimitive()` を新設 |
| メニュー | `Menubar.tsx`（Edit メニューは現状 `Preferences` のみ）、`MenubarSub` 系コンポーネント | Edit メニュー内に Object サブメニューを追加 |
| store 登録 | `useSceneStore.addObject()` / `setSelected()`（`AddObjectCommand` 内で呼ばれる） | 改修不要 |

`sceneManagerRegistry`（`getActiveSceneManager`）も利用可能だが、FBX と一貫させるため **props/state パターン**を採用する（テスト容易性・既存踏襲）。

## 設計判断

- **三角錐の表現**: `THREE.ConeGeometry(radius, height, 3)`（底面三角形の錐＝三角錐）を採用。`TetrahedronGeometry` は正四面体で「三角錐」のイメージとずれるため不採用。メニュー表示名は `Cone`（日本語コメントで「三角錐」と明記）。
- **メニュー位置**: ユーザー指定どおり `Edit > Object > {Cube, Sphere, Cylinder, Cone}`。shadcn/ui の `MenubarSub` / `MenubarSubTrigger` / `MenubarSubContent` を使用（`@/components/ui/menubar` に存在することを実装時に確認）。存在しない場合は `MenubarItem` を直接 Edit 直下に並べる方式へフォールバック。
- **ID/名前の一意性**: プリミティブ追加ごとに連番を採番。
  - id: `prim-<連番>`（`ViewportPanel` 内に `primitiveSequenceRef`（`useRef(1)`）を新設、`importSequenceRef` と同様）。
  - name: `Cube` / `Sphere` / `Cylinder` / `Cone`（同種を複数追加した場合は `Sphere`, `Sphere.001`, ... のように連番サフィックス。Outliner は `object.name` を表示するだけなので衝突しても破綻はしないが、識別性のため連番付与を推奨）。
- **配置**: 既定 Cube と同様 `position.y = (高さ方向の半分)` でグリッド上に乗せる。`castShadow`/`receiveShadow` を有効化（既定 Cube と統一）。
- **生成位置の責務分離**: ジオメトリ生成は新規モジュール `engine/primitives.ts` に切り出し、`Viewport` の既定 Cube とロジック共有しやすくする（任意。最小実装ではファクトリ関数のみでも可）。

## 変更対象ファイル

| ファイル | 変更概要 |
|---|---|
| `src/renderer/src/engine/primitives.ts`（新規） | `PrimitiveKind = 'cube'｜'sphere'｜'cylinder'｜'cone'` 型と `createPrimitiveMesh(kind): THREE.Mesh` ファクトリ。既定 Cube と同じ `MeshStandardMaterial` を生成。各形状の Y オフセット込み。 |
| `src/renderer/src/store/types.ts` | 必要なら `PrimitiveKind` を re-export（または `primitives.ts` に集約のままでも可） |
| `src/renderer/src/ui/layout/Menubar.tsx` | Edit メニュー内に Object サブメニュー追加。`onAddPrimitive: (kind: PrimitiveKind) => void` props を受け取り各項目 `onClick` で発火。`data-testid="add-primitive-<kind>"` を付与（E2E 用）。 |
| `src/renderer/src/ui/layout/DockLayout.tsx` | `pendingPrimitive` state（`{ kind, nonce }` 形式で同種連続追加も検知可能に）を追加。`handleAddPrimitive` を `Menubar` の `onAddPrimitive` に渡し、`ViewportPanel` に props として渡す。 |
| `src/renderer/src/ui/panels/ViewportPanel.tsx` | `pendingPrimitive` props 追加。`primitiveSequenceRef` 新設。`registerPrimitive(kind)`: `createPrimitiveMesh` でメッシュ生成 → meta 生成 → `AddObjectCommand` を `useHistoryStore.execute()` → 追加後に選択。`pendingPrimitive` を監視する `useEffect` を追加（FBX の `pendingFile` useEffect と同型）。 |

`history/commands.ts` / `SceneManager.ts` / `sceneStore.ts` は**無改修**（既存 `AddObjectCommand` をそのまま再利用）。

## 実装ステップ

1. **`engine/primitives.ts` 新規作成**
   - `createPrimitiveMesh(kind)`:
     - `cube`: `BoxGeometry(1,1,1)`, `position.y=0.5`
     - `sphere`: `SphereGeometry(0.5, 32, 16)`, `position.y=0.5`
     - `cylinder`: `CylinderGeometry(0.5, 0.5, 1, 32)`, `position.y=0.5`
     - `cone`（三角錐）: `ConeGeometry(0.5, 1, 3)`, `position.y=0.5`
   - マテリアルは既定 Cube と同設定。`castShadow=true`, `receiveShadow=true`。
   - 余裕があれば `Viewport.createDefaultSceneObjects` の Cube 生成も本ファクトリ経由に置換（重複削減・任意）。
2. **`Menubar.tsx`**: Edit メニューに Object サブメニュー（Cube/Sphere/Cylinder/Cone）追加。`onAddPrimitive` props 配線。日本語コメントで Cone=三角錐を明記。
3. **`DockLayout.tsx`**: `pendingPrimitive` state と `handleAddPrimitive` を追加し、`Menubar`・`ViewportPanel` に配線。
4. **`ViewportPanel.tsx`**: `pendingPrimitive` props・`primitiveSequenceRef`・`registerPrimitive`・監視 `useEffect` を追加。`registerImportedGroup` を参考にし `AddObjectCommand`（`type:'mesh'`, `parentId:null`, `visible:true`）で登録、生成オブジェクトを選択状態に。
5. 各形状が原点付近・グリッド上に正しく表示され、Outliner に項目が増えること、Undo/Redo（既存 `Ctrl+Z`）で追加が取り消せることを確認。

## 検証方法

- `npm run typecheck && npm run lint && npm run test` がすべて緑（AGENTS.md 準拠。テスト自体の変更・追加が必要な場合は着手前にユーザー承認）。
- 手動/E2E 確認:
  - `Edit` メニュー → `Object` → 各形状クリックで、Outliner 項目（`[data-testid^="outliner-item-"]`）が 1 件増える。
  - ビューポートに対象形状（球/円柱/三角錐）がグリッド上へ表示される。
  - 追加直後に対象が選択状態（Outliner ハイライト、ギズモ表示）。
  - `Ctrl+Z` で追加が Undo、`Ctrl+Shift+Z` で Redo できる。
- 推奨 E2E（要ユーザー承認・新規 spec）: `tests/e2e/` に `primitive-add.spec.ts` を追加し、FBX メニューテスト（`fbx-import.spec.ts`）と同型で各形状追加後の Outliner 件数増を検証。

## 成果物

本プランを **`docs/MESH_PRIMITIVES_PLAN.md`** として書き出す（ExitPlanMode 承認後に実施。実装は別 AI エージェントが担当）。
