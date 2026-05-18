# 範囲選択（ラバーバンド矩形ドラッグ選択） 実装プラン

> 既存「編集モード（頂点/エッジ/面）」へ **左ドラッグ矩形範囲選択（オクルージョン判定付き）** を追加する。対象 `/home/tom/maya_plguin/3dEngine` ブランチ `main`。主動機は「エッジ選択がしづらい」課題の解消。

## Context

現在の編集モードは頂点/エッジ/面ともに raycaster による単発クリックピックのみ（`docs/EDGE_FACE_EDIT_PLAN.md` の成果）。特にエッジは線分が細くクリック命中が難しい。Maya/Blender 風の矩形ドラッグ選択（crossing 方式：矩形に触れた要素を選択）を追加する。OrbitControls は左ボタン `null`（`Viewport.ts`）のため左ドラッグを範囲選択に専有できる。

設計の柱は **「範囲選択の解決を `MeshEditController` の新規メソッドに集約し、最終的に既存 `store.setSelectedVertices/Edges/Faces` を呼ぶ一点集約を維持する」** こと。これにより可視化・gizmo 再配置・`VertexEditCommand`/Undo/Redo を完全再利用し、`SceneManager`/`commands.ts`/store スキーマを無改修にする。

## 主要設計判断

- **矩形オーバーレイ = React 絶対配置 div（推奨）**: 新規最小コンポーネント `RubberBandOverlay.tsx` を `containerRef` div の兄弟に置き、`pointer-events-none` の矩形 div を描画。canvas2D は新規 canvas・リサイズ・dispose 管理が増えるため不採用。`Viewport`/`renderer` 無改修。
- **ドラッグ判定 = 既存 `isClickWithinMoveThreshold`(4px) 再利用**: `handlePointerUp` で「4px 以内＝従来クリックピック（無改修）」「4px 超＝範囲選択」に分岐。`handlePointerMove` を新規追加し `setPointerCapture` で section 外もイベント継続。矩形座標は `ViewportPanel` 本体の `useState` に置かず（巨大 `useEffect`/購読の再評価防止）、`RubberBandOverlay` の命令的ハンドル（`forwardRef`+`useImperativeHandle`）へ ref 経由で渡す。
- **範囲内判定 = crossing 方式（推奨）**: 頂点＝投影点が矩形内。エッジ＝代表ペア両端いずれかが矩形内 OR 線分が矩形辺と交差（長いエッジ取りこぼし防止＝主動機に直結）。面＝構成頂点（weld 展開済み）いずれかが矩形内。全要素ともオクルージョン通過分のみ最終選択。
- **オクルージョン = CPU レイキャスト方式（推奨）**: 候補ごとに「カメラ→候補ワールド座標」へ `SelectionRaycaster.intersect(ndc,camera,[targetMesh],false)` を飛ばし、最前面ヒット距離 + ε が候補距離より手前なら隠面とみなし除外。GPU 深度 readback は `Viewport`/`IRenderer`/テストモック整合が大規模なため不採用。ε は相対値（候補距離×1e-3、絶対下限 1e-4）で自己遮蔽の数値誤差を許容。法線バックフェイス（候補所属面法線とカメラ方向の内積）を補助判定に併用。法線無し geometry は三角形から面法線算出（既存 `computeTriangleNormal` 相当）。
- **オブジェクトモード = 本スコープ外（推奨）**: `sceneStore` が単一選択のみで複数選択化は store/gizmo/SceneManager/全購読/既存テストへ大規模改修。主動機は編集モードで充足。オブジェクトモードの左ドラッグは従来どおり無反応（矩形も出さない）。将来スコープに明記。
- **Shift 追加選択 = サポート（推奨）**: 既存クリックピックと一貫。Shift で union、非 Shift で置換。空矩形＋非 Shift で選択クリア、Shift+空で維持。
- **性能**: weld 代表点のみ評価 → ①ブロードフェーズ（投影＋矩形 AABB 棄却、安価）→ ②通過分のみオクルージョンレイキャスト。行列はループ外キャッシュ、Vector3 バッファ再利用、カメラ後方（w<=0）は即除外。

## 後方互換性

- `store` スキーマ（`selectedVertices/Edges/Faces`、`setSelected*`）: **完全不変**。
- `SceneManager` / `commands.ts` / `VertexEditCommand` / `syncVertexTransformGizmo`: **無改修**で再利用。
- 既存クリック単発選択（4px 以内分岐）: **完全不変**。
- `Viewport.ts` / `IRenderer` / `SelectionRaycaster` 公開 API: 無改修（追加のみ）。
- 既存テスト群: 無改修で緑維持。

## 変更対象ファイル

| ファイル | 変更概要 |
|---|---|
| `src/renderer/src/engine/selection/Raycaster.ts` | 純関数追加: `worldToScreenNdc` / `NdcRect` / `makeNdcRect` / `isNdcPointInRect` / `ndcSegmentIntersectsRect`。既存 `SelectionRaycaster`・`clientPointToNdc` は不変 |
| `src/renderer/src/engine/edit/MeshEditController.ts` | 範囲選択解決を追加: `resolveVerticesInRect` / `resolveEdgesInRect` / `resolveFacesInRect` / private `isOccluded`。オクルージョン定数追加。`enter()`/既存 API 無改修 |
| `src/renderer/src/ui/panels/RubberBandOverlay.tsx` | **新規（最小）**: 矩形 div を描画。`forwardRef`+`useImperativeHandle` で `setRect`/`hide` 公開 |
| `src/renderer/src/ui/panels/ViewportPanel.tsx` | `handlePointerMove` 追加、`handlePointerUp` に 4px 超＝範囲選択分岐、`RubberBandOverlay` 配線、`setPointerCapture`/Esc/`pointercancel` 破棄 |
| `store/*` `SceneManager`/`commands.ts`/`Viewport.ts` | **無改修**（再利用） |

## 追加/変更する関数シグネチャ

```ts
// Raycaster.ts（純関数・追加）
export function worldToScreenNdc(world: THREE.Vector3, camera: THREE.Camera):
  { x: number; y: number; z: number } | null
export interface NdcRect { minX: number; minY: number; maxX: number; maxY: number }
export function makeNdcRect(a: THREE.Vector2, b: THREE.Vector2): NdcRect
export function isNdcPointInRect(x: number, y: number, rect: NdcRect): boolean
export function ndcSegmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: NdcRect): boolean

// MeshEditController.ts（追加）
resolveVerticesInRect(rect: NdcRect, camera: THREE.Camera, raycaster: SelectionRaycaster): number[]
resolveEdgesInRect(rect: NdcRect, camera: THREE.Camera, raycaster: SelectionRaycaster): number[]
resolveFacesInRect(rect: NdcRect, camera: THREE.Camera, raycaster: SelectionRaycaster): number[]
private isOccluded(worldPoint: THREE.Vector3, camera: THREE.Camera, raycaster: SelectionRaycaster): boolean

// RubberBandOverlay.tsx（新規）
export interface RubberBandHandle {
  setRect: (rectCss: { left: number; top: number; width: number; height: number }) => void
  hide: () => void
}
```

オクルージョン ε / 法線しきい値は `MeshEditController.ts` 冒頭定数群に `OCCLUSION_DEPTH_EPS_RATIO` / `OCCLUSION_DEPTH_EPS_MIN` として日本語コメント付きで定義。

## Phase 分け

各 Phase 終了時に `npm run typecheck && npm run lint && npm run test` が緑であること。テストの新規追加・既存変更は AGENTS.md に従い**着手前にユーザー承認**（本プランはテスト設計記述のみ）。コメント日本語、Prettier 準拠（シングルクォート/セミコロンなし/printWidth100）。

### Phase 1 — 投影・矩形ヘルパ（純関数、副作用なし）
- `Raycaster.ts` に `worldToScreenNdc`/`NdcRect`/`makeNdcRect`/`isNdcPointInRect`/`ndcSegmentIntersectsRect` を追加。既存関数不変。
- **完了条件**: typecheck/lint/test 緑。新関数未参照のため挙動ゼロ変更。
- （要承認）`Raycaster.test.ts`: カメラ前方/後方投影、矩形内外、線分×矩形（内包/横断/接触/完全外）。

### Phase 2 — `MeshEditController` 範囲選択解決（可視化・UI なし）
- `enter()` 無改修（既存 `weldGroups`/`edges`/`faceGroups`/`indexToGroupKey`/`edgeIdToRepresentativePair` 再利用）。
- `resolveVerticesInRect`（weld 代表点を投影→矩形→`isOccluded`→通過なら weld 全 index）、`resolveEdgesInRect`（代表ペア両端投影、点 in rect いずれか OR 線分交差、片端可視で論理エッジ ID 採用）、`resolveFacesInRect`（構成頂点いずれかが矩形内かつ非遮蔽で面 ID 採用）、`isOccluded`（最近ヒット距離 vs 候補距離を ε 比較＋法線バックフェイス補助）を追加。返り値は昇順・重複排除。
- **完了条件**: typecheck/lint/test 緑。公開 API 後方互換（追加のみ）。
- （要承認）`MeshEditController.test.ts`: `BoxGeometry` で正面矩形の頂点が weld 展開で解決、裏面頂点が `isOccluded` で除外、エッジ crossing、面 crossing。

### Phase 3 — オーバーレイ UI（描画のみ、選択未配線）
- `RubberBandOverlay.tsx` 新規（`pointer-events-none`、`absolute`、`border border-sky-400 bg-sky-400/10`、初期非表示、`data-testid` 付与）。
- `ViewportPanel` に `<RubberBandOverlay ref={rubberBandRef} />` を `containerRef` div の兄弟配置。`handlePointerMove` 追加：`pointerDownRef` 非 null かつ 4px 超で `setPointerCapture`、`containerRef` 矩形基準で `setRect`。`handlePointerUp`/`pointercancel`/Esc で `hide()`（この Phase は選択処理なし）。
- **完了条件**: typecheck/lint/test 緑。ドラッグで矩形描画→離すと消える。4px 以内クリックは従来どおり矩形非表示。
- （要承認）`ViewportPanel.test.tsx`: down→move(>4px)で矩形表示、up で非表示、down→up(<=4px)で非表示。

### Phase 4 — 選択配線（store 一点集約）+ Shift + 破棄
- `handlePointerUp` の 4px 超分岐：`editorMode==='edit'` のみ、`editSubMode` で `resolveVerticesInRect`/`resolveEdgesInRect`/`resolveFacesInRect`、Shift で union/非 Shift で置換、空＋非 Shift で `setSelected*([])`、Shift+空で維持、最後に `hide()`。`editorMode!=='edit'` は従来どおり無反応。
- 既存購読が自動でハイライト/gizmo 同期 → 追加配線不要。Esc/`pointercancel`/離脱は選択変更せず矩形破棄。
- **完了条件**: typecheck/lint/test 緑。編集モードでドラッグ→範囲内の頂点/エッジ/面が選択・ハイライト・gizmo アタッチ、Shift 追加、隠面非選択。クリック単発・Undo/Redo 不変。
- （要承認）`ViewportPanel.test.tsx`: 各サブモードで `setSelected*` 期待値、Shift union、空矩形クリア、Esc 破棄。

### Phase 5 — 統合・エッジケース・E2E
- エッジケース表潰し込み、手動確認、`Viewport`/`SceneManager`/`commands.ts`/store 無改修確認。
- **完了条件**: 全 Phase 緑、手動チェックリスト通過。
- （要承認）`tests/e2e/`（`subobject-edit.spec.ts` 拡張 or 新規 `rubber-band-select.spec.ts`）: 矩形ドラッグでエッジ複数選択→gizmo 移動→Undo、頂点/面の矩形選択、Shift 追加、隠面（カメラ反対側頂点）非選択。

## エッジケース

| ケース | 期待挙動 |
|---|---|
| 4px 以内のドラッグ | 従来の単発クリックピック（無改修分岐） |
| 4px 超だがオブジェクトモード | 何もしない・矩形も出さない（従来挙動維持） |
| 矩形が要素ゼロ・非 Shift | `setSelected*([])`（既存空クリックと一貫） |
| 矩形が要素ゼロ・Shift | 選択維持 |
| カメラ後方の頂点 | `worldToScreenNdc` が null → 候補除外 |
| mesh 裏面の頂点/エッジ/面 | `isOccluded` で除外（自己遮蔽） |
| 同一平面頂点が数値誤差で自己遮蔽 | ε 許容で除外しない |
| 法線属性なし FBX | 三角形から面法線算出 |
| 非 indexed geometry | 既存 weld/edges/faceGroups の連番フォールバックでそのまま機能 |
| 大きく移動後の再範囲選択 | position 共有属性で最新、既存 `recomputeBounds` 系で bounds 整合 |
| ドラッグ中に section 外へ | `setPointerCapture` で継続、矩形は container 内クランプ |
| ドラッグ中 Esc / `pointercancel` | 選択変更なし・矩形破棄 |
| 中ボタン併用（OrbitControls 回転） | `button!==0` ガードで分離、競合しない |
| 巨大ポリゴンで頂点全外だが面が矩形横断 | 第一版は取りこぼし（R3、将来三角形×矩形交差で改善） |
| 編集中に別オブジェクト選択 | 既存 `setSelected`/`removeObject` が Object Mode 復帰、範囲選択も state ガードで無効 |

## リスク・前提

- (R1) オクルージョン CPU レイキャストは候補通過数×三角形数。`SelectionRaycaster` は BVH 非搭載だが単一編集対象 mesh のみで実用範囲。ブロードフェーズ先行で大半棄却。密メッシュ高速化（BVH/GPU）は将来。
- (R2) 矩形座標は必ず `RubberBandOverlay` の局所 state + 命令的ハンドルに隔離（`ViewportPanel` 本体を再レンダリングさせない）。
- (R3) 面 crossing は第一版「構成頂点いずれかが矩形内」。巨大ポリゴン横断は取りこぼし → 三角形×矩形交差は将来拡張。
- (R4) オクルージョン ε は相対＋絶対下限。誤判定時は法線バックフェイス補助を主・距離判定を従に調整。定数化＋コメント。
- (R5) 左ボタン専有は `Viewport.ts` の OrbitControls 左 `null` 前提。`button===0` + editorMode ガードで局所化。
- (R6) 後方互換の核は「最終的に `store.setSelected*` を呼ぶだけ」。クリック分岐（4px 以内）に一切触れない。
- (R7) `setPointerCapture` は `event.pointerId` を使用し `pointerup`/`pointercancel` 双方で確実に解放（リーク防止）。

## 検証方法（受け入れ基準）

1. `npm run typecheck && npm run lint && npm run test` 緑。
2. `npm run test:e2e` 緑。
3. ブラウザ手動確認:
   - キューブ選択→ビューポートフォーカス→`Tab` で編集モード。
   - エッジサブモード（`2`）で複数エッジを跨ぐ矩形ドラッグ → 触れたエッジが一括選択。
   - 頂点（`1`）/面（`3`）でも矩形選択が機能、ハイライト連動。
   - カメラ正面の矩形で mesh 裏側の頂点/エッジ/面が**選択されない**。
   - Shift+矩形で追加、空矩形（非 Shift）で全解除、Shift+空で維持。
   - 4px 以内のドラッグ＝従来クリック選択が不変。
   - 範囲選択を gizmo でドラッグ→形状変化→`Ctrl+Z`/`Ctrl+Shift+Z` で Undo/Redo。
   - ドラッグ中 Esc / ビューポート外へ → 矩形破棄、選択不変。
   - オブジェクトモードで左ドラッグ → 無反応（矩形も出ない）。

## 将来スコープ（本機能対象外）

- オブジェクトモードの矩形選択（store 複数選択化が前提、大規模）。
- 面 crossing の三角形×矩形厳密交差。
- オクルージョン高速化（BVH / GPU 深度 readback）。
