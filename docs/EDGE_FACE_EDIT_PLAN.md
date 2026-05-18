# エッジ選択編集・面選択編集 実装プラン

> 既存「頂点編集モード (Edit Mode)」へ **エッジ選択編集** と **面選択編集** を追加し、編集モード中に数字キー `1`=頂点 / `2`=エッジ / `3`=面 でサブオブジェクトモードを切り替えられるようにする。対象 `/home/tom/maya_plguin/3dEngine` ブランチ `main`。

## Context

現状の編集モードは頂点 (`THREE.Points`) の選択・移動のみ対応（`docs/VERTEX_EDIT_PLAN.md` の成果、コミット済み）。Maya/Blender 風の 3D エディタとして、頂点だけでなく **エッジ・面のサブオブジェクト編集** が必要というユーザー要望。切替は Blender/Maya 慣例に近い数字キー（1/2/3）。

設計の柱は **「プリミティブ選択を最終的に position index 集合へ解決し、既存の `vertexProxy` / gizmo / `VertexEditCommand` パイプラインを完全再利用する」** こと。これにより新コマンド不要・`commands.ts`/`SceneManager` 無改修・`selectedVertices` のセマンティクス不変（後方互換）を実現する。

## 主要設計判断

- **選択状態の持ち方 = ハイブリッド（推奨）**: store に `selectedEdges:number[]`（論理エッジID）/ `selectedFaces:number[]`（論理面ID）を追加。`selectedVertices` は**頂点サブモード時のみ書く**＝既存セマンティクス不変。gizmo/Command は「アクティブ選択を解決した position index 集合」を使う。→ エッジ/面ハイライトを正確に再現でき、Shift 追加選択がプリミティブ単位で自然、後方互換◎。
- **`MeshEditController` 構造 = facade 維持 + 内部サブコントローラ分離（推奨）**: 公開メソッド面（`getPointsObject()` 等 ViewportPanel 呼び出し）は維持しつつ、内部に頂点/エッジ/面の選択ロジック・可視化を分割。weldGroups / position アクセス / `notifyGeometryUpdated` / `recomputeBounds` は facade 集約。dispose 漏れ防止のため `deleteAttribute('position')`→dispose の既存パターンを全可視化オブジェクトで踏襲。
- **面の粒度 = 連結同一平面ポリゴン集約（Maya/Blender 風、推奨）**: `intersection.faceIndex`（三角形）を起点に、**共有エッジ + 法線一致**で連結する三角形群を 1 論理面に集約（立方体の 1 面 = 三角形 2 枚を 1 クリックで選択）。三角形単位は集約の最小単位として内部表現に残す。`enter()` 時に隣接 + 法線一致でグルーピングして `faceGroups` を構築。

## 後方互換性

- `selectedVertices` の型・正規化・購読・セマンティクス: **完全不変**。
- `VertexEditCommand` / `history/commands.ts`: **無改修**で再利用。
- `engine/SceneManager.ts` / `SceneManagerStoreState` / `SceneManager.test.ts`: **無改修**（`editorMode==='edit'` の BoxHelper 抑制が全サブモード共通で機能）。
- `useKeybinds` シグネチャ: 第3引数オプショナルで既存呼び出し互換。
- 既存 E2E `tests/e2e/vertex-edit.spec.ts`: StatusBar の `data-testid="editor-mode-label"` を維持（テキストは `toContainText('編集モード')` で吸収）。

## 変更対象ファイル

| ファイル | 変更概要 |
|---|---|
| `src/renderer/src/store/types.ts` | `export type EditSubMode = 'vertex'｜'edge'｜'face'` 追加 |
| `src/renderer/src/store/sceneStore.ts` | `editSubMode`/`selectedEdges`/`selectedFaces` と `setEditSubMode`/`setSelectedEdges`/`setSelectedFaces`、enter/exit/setSelected/removeObject への波及 |
| `src/renderer/src/engine/edit/MeshEditController.ts` | サブモード対応（内部分割）、エッジ集合・面グループ構築、LineSegments/面 overlay 可視化、`resolveActiveMoveIndices`/`getActiveSelectionCentroidWorld` |
| `src/renderer/src/engine/selection/Raycaster.ts` | `intersectLineSegments(ndc,camera,lineSegments,threshold)` 追加（`params.Line.threshold` 一時設定→復元） |
| `src/renderer/src/ui/hooks/useKeybinds.ts` | 第3引数 `onSetEditSubMode?`、`1/2/3` マッピング（preventDefault しない） |
| `src/renderer/src/ui/panels/ViewportPanel.tsx` | `onSetEditSubMode` 配線、`editSubMode`/`selectedEdges`/`selectedFaces` 購読、`handlePointerUp` サブモード分岐、gizmo/Command パイプラインの `resolveActiveMoveIndices` 一点差替 |
| `src/renderer/src/ui/layout/StatusBar.tsx` | サブモード併記（`編集モード（頂点/エッジ/面）`）、`data-testid="edit-submode-label"` 追加 |
| `history/commands.ts` / `engine/SceneManager.ts` | **無改修**（再利用） |

## Phase 分け

各 Phase 終了時に `npm run typecheck && npm run lint && npm run test` が緑であることを確認する。テストの新規追加・既存テスト変更は AGENTS.md に従い**着手前にユーザー承認**を取得（本プランはテスト設計記述のみ）。

### Phase 1 — ストアと型（副作用なし）
- `types.ts` に `EditSubMode`。
- `sceneStore.ts`: `editSubMode`（初期 `'vertex'`）/`selectedEdges`/`selectedFaces`（昇順・重複排除＝既存正規化を流用）追加。
  - `setEditSubMode(mode)`: モード更新＋**全プリミティブ選択クリア**。
  - `setSelectedEdges/Faces(ids)`: 正規化。
  - `enterEditMode`/`exitEditMode`: `editSubMode:'vertex'` + 3配列クリア。
  - `setSelected`/`removeObject`（Edit 強制解除時）: 同様に 3配列 + `editSubMode` リセット。
- **完了条件**: 既存テスト緑。新フィールド未参照のため挙動ゼロ変更。
- （要承認）`sceneStore.test.ts`: サブモード切替で全クリア、enter/exit/setSelected/removeObject 初期化、edges/faces 正規化。

### Phase 2 — 数字キーとステータス表示
- `useKeybinds.ts`: `onSetEditSubMode?` 追加。`isEditableTarget` ガード後、`1/2/3`→`onSetEditSubMode(mode)`（**preventDefault しない**＝オブジェクトモード時副作用ゼロ）。Tab/W/E/R は不変。
- `ViewportPanel.tsx`: `onSetEditSubMode = () => { const s=getState(); if(s.editorMode!=='edit') return; s.setEditSubMode(mode) }` を `useKeybinds` に渡す。
- `StatusBar.tsx`: `editSubMode` 購読しサブモード併記。`editor-mode-label` 維持 + `edit-submode-label` 追加。
- **完了条件**: 編集モード中 1/2/3 で表示切替、オブジェクトモードで無反応。
- （要承認）`useKeybinds.test.tsx`: 1/2/3 で `onSetEditSubMode`、入力欄フォーカス時無反応、Tab/W/E/R 不変。

### Phase 3 — エッジ集合・面グループの構築（可視化なし）
- `MeshEditController` を内部分割。`enter()` で:
  - **論理エッジ**: index バッファ走査（`getIndex()` null は連番フォールバック）。三角形の 3 辺を `indexToGroupKey` で論理頂点キーへ変換し、`min:max` キーで weld 集約。`edges:{id,positionIndices:number[]}[]`（両端 weld 展開済み）、`edgeKeyToId:Map`。
  - **論理面**: 三角形 (faceIndex) を最小単位とし、**共有エッジ + 法線一致**で連結三角形を集約 → `faceGroups:{id,faceIndices:number[],positionIndices:number[]}[]`、`triToFaceGroup:Map`。法線属性が無い場合は三角形頂点から面法線を算出。
- `exit()` で edges/faceGroups もクリア。weldGroups/position アクセスは facade 集約。
- **完了条件**: `enter()` で構造構築。頂点編集挙動不変。
- （要承認）`MeshEditController.test.ts`: `BoxGeometry`(36 index) で論理エッジ 12 本、面グループ 6 面、各 positionIndices が正しいこと。

### Phase 4 — 可視化（LineSegments / 面 overlay）
- **エッジ**: index 付き BufferGeometry に `setAttribute('position', sharedPositionAttr)` + `setIndex(論理エッジ代表ペア)`。非選択 LineSegments（青）+ 選択 overlay LineSegments（橙, `depthTest:false`, 動的 setIndex）。mesh の子に add（変換追従）。
- **面**: 選択三角形のみの overlay `THREE.Mesh`（共有 position + `setIndex`、`MeshBasicMaterial{color:0xffa000,transparent,opacity:0.35,depthTest:false,side:DoubleSide}`）。mesh の子に add。
- `setActiveSubMode(mode)` で Points/LineSegments/面 overlay の `.visible` 切替（enter 直後は vertex）。
- dispose: 各可視化とも `deleteAttribute('position')`→`dispose()`→material `dispose()` を `exit()` に集約。
- `ViewportPanel`: `editSubMode` 購読で `setActiveSubMode`、`selectedEdges`/`selectedFaces` 購読で各ハイライト更新 + `syncVertexTransformGizmo()`。
- **完了条件**: 1/2/3 で可視化（点群/線分/面）が切替。

### Phase 5 — ピックと選択・gizmo/Command 再利用
- `Raycaster.ts`: `intersectLineSegments`（`params.Line.threshold` 一時設定→復元、`intersectPoints` と同型）。面は既存 `intersect()` を**編集対象 mesh** に対して使い `intersection.faceIndex` 取得（新メソッド不要）。
- `MeshEditController`:
  - `resolveEdgeSelection(intersection)` → 論理エッジID。
  - `resolveFaceSelection(intersection)` → `triToFaceGroup` で論理面ID。
  - `resolveActiveMoveIndices():number[]` = サブモード別に移動対象 position index 集合（vertex=`selectedVertices` / edge=選択エッジ positionIndices union / face=選択面 positionIndices union）。
  - `getActiveSelectionCentroidWorld()` = 上記集合の重心（既存 `getSelectionCentroidWorld` を流用）。
  - `recomputeBounds`/`notifyGeometryUpdated` に LineSegments/面 overlay の boundingSphere 再計算を追加（既存 pointsGeometry と同理由＝raycast 早期棄却対策）。
- `ViewportPanel.handlePointerUp` を `editSubMode` 分岐:
  - vertex: 既存処理そのまま（無変更）。
  - edge: `intersectLineSegments`→`resolveEdgeSelection`→`setSelectedEdges`（通常=置換/Shift=union/空=解除）。
  - face: `intersect(targetMesh)`→`faceIndex`→`resolveFaceSelection`→`setSelectedFaces`（同上）。
- **gizmo/Command 一点差替（核心）**:
  - `syncVertexTransformGizmo` 内 `getSelectionCentroidWorld(state.selectedVertices)` → `meshEditController.getActiveSelectionCentroidWorld()`。
  - `onDragStart`/`onObjectChange`/`onCommitTransform` 内の `state.selectedVertices` / `snapshotPositions(indices)` の `indices` → `meshEditController.resolveActiveMoveIndices()`。
  - 頂点モードでは結果が従来と同値 → 頂点編集挙動不変。`VertexEditCommand` はそのまま再利用（新コマンド不要）。`selectedEdges`/`selectedFaces` 購読でも `syncVertexTransformGizmo()` を呼ぶ。
- **完了条件**: エッジ/面をクリック選択→gizmo 移動→形状変化→Undo/Redo が頂点モードと同様に動作。
- （要承認）`Raycaster.test.ts`（intersectLineSegments threshold）、`MeshEditController.test.ts`（resolveEdge/Face、resolveActiveMoveIndices、ハイライト）。

### Phase 6 — 統合・エッジケース・E2E
- エッジケース表の潰し込み、手動確認。`SceneManager`/`commands.ts` 無改修確認。
- （要承認）`tests/e2e/`（`vertex-edit.spec.ts` 拡張 or 新規 `subobject-edit.spec.ts`）: 1/2/3 切替、エッジ選択→移動→Undo、面選択→移動→Undo、サブモード切替で選択クリア。

## エッジケース

| ケース | 期待挙動 |
|---|---|
| サブモード切替 1↔2↔3 | 全選択クリア、可視化切替、gizmo detach |
| 非indexed geometry でエッジ | 連番 index フォールバック（weld 集約は座標一致で機能） |
| BoxGeometry のエッジ 1 本ピック | weld 集約で論理 1 本、両端 position index を移動対象 → 面が裂けない |
| BoxGeometry の面 1 クリック | 連結同一平面集約で立方体 1 面全体（三角形 2 枚）を選択 |
| アクティブ選択空で gizmo 操作 | gizmo detach |
| edit 中に別オブジェクト選択 / editTargetId 削除 | `setSelected`/`removeObject` が全クリア・Object Mode |
| エッジ/面選択中に Undo | position index ベースで頂点と同様復元、`onApplied` で overlay bounds 再計算 |
| オブジェクトモードで 1/2/3 | no-op（ViewportPanel で early return、preventDefault せず） |
| 法線属性なし FBX で面移動 | `notifyGeometryUpdated` の normal ガード既存踏襲 |
| 大きく移動後の再ピック | LineSegments/overlay の boundingSphere を再計算（pointsGeometry と同方針） |

## リスク・前提

- (R1) LineSegments/overlay mesh は `LineSegments.raycast`/`Mesh.raycast` が boundingSphere で早期棄却するため、頂点移動後の `computeBoundingSphere` 再計算を `notifyGeometryUpdated`/`recomputeBounds` に追加必須。
- (R2) `selectedVertices` セマンティクス不変（頂点サブモード時のみ書く）→ 後方互換維持、既存購読・テスト無改修。
- (R3) gizmo/Command 再利用の鍵は `resolveActiveMoveIndices()` 一点集約。差替箇所は `ViewportPanel` の 3 コールバック + `syncVertexTransformGizmo` のみ。
- (R4) 面集約は法線一致 + 共有エッジ。曲面メッシュ（法線が連続変化）では集約が小さく分かれる可能性 → 三角形最小単位で機能上は問題なし。集約閾値（法線角度）は定数化しコメント。
- (R5) 数字キーは将来オブジェクトモードで別機能割当の余地 → `onSetEditSubMode` は preventDefault せず edit 中のみ作用で衝突回避。
- (R6) 内部分割時の `exit()`/`dispose()` 解放漏れ注意。共有 GPU バッファ二重解放防止のため `deleteAttribute('position')`→dispose を厳守。

## 検証方法（全 Phase 通しての受け入れ基準）

1. `npm run typecheck && npm run lint && npm run test` が緑。
2. `npm run test:e2e` が緑。
3. ブラウザ手動確認:
   - キューブ選択→ビューポートフォーカス→`Tab` で編集モード（StatusBar「編集モード（頂点）」）。
   - `1/2/3` で頂点/エッジ/面に切替、StatusBar 表示と可視化（点群/線分/面）が連動。切替で選択クリア。
   - 各サブモードでクリック選択（Shift で追加、空クリックで解除）、選択がハイライト。
   - 選択を gizmo でドラッグ→形状変化→`Ctrl+Z`/`Ctrl+Shift+Z` で Undo/Redo。
   - 立方体の 1 面クリックで面全体（三角形 2 枚）が選択される。
   - `Tab` で Object Mode 復帰、編集結果保持、選択枠/ギズモ復帰。
   - PropertiesPanel 入力欄フォーカス中の 1/2/3・Tab はモード切替を起こさない。
   - 編集モード中に Outliner で別オブジェクト選択 → Object Mode へ自動復帰。
