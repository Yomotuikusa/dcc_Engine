# 頂点編集 (Edit Mode) 実装プラン

> 本ドキュメントは「メッシュの頂点を直接選択・移動する編集モード」を実装するための、AI エージェントが Phase 単位で実行できる作業計画である。実装対象は `/home/tom/maya_plguin/3dEngine` ブランチ `main`。
>
> 操作仕様: ビューポートにフォーカスがある状態で **`Tab` キーを押すと編集モード (Edit Mode) に入り、編集モード中に `Tab` を押すとオブジェクトモード (Object Mode) に戻る**（Blender 準拠のトグル）。

---

## Context

現プロジェクトは Web SPA で、3 層分離 (`engine/` / `store/` / `ui/`) と zustand v5 `subscribeWithSelector`、Command パターンの Undo/Redo を採用している（`docs/UNDO_REDO_PLAN.md` の成果）。

関連する既存実装の要点:

- `store/sceneStore.ts`: `selectedId` / `transformMode` / `selectedTransform` を保持。`commitTransform(transform, source)` の `source: 'engine' | 'ui'` で書き戻し方向を制御する。
- `engine/SceneManager.ts`: `idToObject: Map<string, Object3D>` を保持。`selectedId` を購読し、選択時に `THREE.BoxHelper`（黄色の選択枠）を生成・破棄する。`getObjectById` / `findIdForObject` / `getSelectableObjects`（visible な `Mesh` のみ）を提供。
- `engine/controls/TransformController.ts`: Three.js `TransformControls` のラッパ。`attach(Object3D)` でギズモを対象に付け、`dragging-changed` 完了時に `onCommitTransform(target, before)` を発火する。
- `engine/selection/Raycaster.ts`: `SelectionRaycaster.pick(ndc, camera, objects, recursive)`。内部に `THREE.Raycaster` を保持（`params.Points.threshold` は未設定 = デフォルト 1）。
- `ui/panels/ViewportPanel.tsx`: 上記をすべて配線する統合点。`handlePointerUp` で raycast し `setSelected` する。`useKeybinds`（W/E/R = transformMode 切替）を `<section onKeyDown>` に接続。`tabIndex={0}` でビューポートにフォーカスが当たる。
- `ui/hooks/useKeybinds.ts`: ビューポート `onKeyDown` で `mapKeyToTransformMode` により W/E/R を処理。**フォーカス必須**の DOM イベント方式。
- `history/commands.ts`: `Command { kind; do(); undo() }` と `TransformCommand` / `AddObjectCommand` / `RemoveObjectCommand`。`useHistoryStore.execute(cmd)` で履歴に積む。
- `engine/sceneManagerRegistry.ts`: モジュールスコープの `activeSceneManager`。React 外（Command）から `getActiveSceneManager()` で参照する仕組み。

**重要な前提**: デフォルトキューブは `THREE.BoxGeometry`（インデックス付き・面ごとに頂点が重複）。FBX インポートのメッシュも `BufferGeometry`。頂点編集は `geometry.attributes.position`（`BufferAttribute`）を直接書き換えて行う。

---

## Scope

### 含む

- ビューポートにフォーカスがある状態での `Tab` による Object Mode ⇔ Edit Mode のトグル
- Edit Mode 突入条件: **メッシュ (`THREE.Mesh`) が 1 つ選択されている**こと（未選択・メッシュ以外選択時は突入しない = no-op）
- Edit Mode 中:
  - 選択メッシュの全頂点を点群 (`THREE.Points`) で可視化
  - クリックで頂点を 1 つ選択、`Shift`+クリックで追加選択、空クリックで全解除
  - 選択頂点をハイライト表示（色を変える）
  - 選択頂点群を `TransformControls`（translate）でドラッグ移動
  - 移動確定で `geometry.attributes.position` を更新し、Undo/Redo 履歴に積む（`VertexEditCommand`）
- Edit Mode 中はオブジェクト選択枠 (`BoxHelper`) とオブジェクト用ギズモを抑制
- Object Mode へ戻ると頂点点群・頂点ギズモを破棄し、編集結果は保持
- Edit Mode の状態は `sceneStore` で一元管理（`editorMode` / `selectedVertices`）
- ステータスバーに現在のモードを表示
- ユニットテスト / コンポーネントテスト / E2E テストの**設計記述**（実装は AGENTS.md に従いユーザー承認後）

### 含まない (将来用)

- 辺 (Edge) / 面 (Face) サブオブジェクト編集モード（頂点のみ）
- 矩形（ラバーバンド）選択・投げ縄選択（クリック / Shift+クリックのみ）
- 頂点の追加・削除・押し出し・ループカット等のメッシュ編集オペレータ
- 頂点の rotate / scale（Edit Mode は translate のみ。W/E/R 切替は Edit Mode では translate に固定）
- 重複頂点の自動ウェルド設定 UI（既定のウェルド挙動は「設計判断」節で定義）
- 複数メッシュ同時編集（Edit Mode 対象は選択中の 1 メッシュのみ）

---

## アーキテクチャの全体像

```
[Tab keydown @ ViewportPanel section focus]
        │  (selectedId が Mesh のときのみ)
        ▼
sceneStore.toggleEditorMode()  ──>  editorMode: 'object' ⇄ 'edit'
        │
        ▼ (ViewportPanel が editorMode を購読)
  enter:  MeshEditController.enter(mesh)  ──> Points 点群生成 / BoxHelper 抑制 / objectギズモ detach
  exit :  MeshEditController.exit()       ──> 点群・頂点ギズモ破棄 / BoxHelper 復帰

[Edit Mode 中の pointerup]
        │
        ▼
SelectionRaycaster (Points threshold) ──> 頂点 index 群を解決
        │
        ▼
sceneStore.setSelectedVertices([...])  ──> ハイライト更新 / 頂点ギズモを重心へ attach

[頂点ギズモ drag 完了]
        │
        ▼
historyStore.execute(new VertexEditCommand(targetId, indices, before, after))
        │
        └─> geometry.attributes.position 書換 + needsUpdate + bounds/normal 再計算
```

設計の柱:

- **状態は `sceneStore` に集約**。`editorMode` と `selectedVertices` を追加し、既存の `selectedId` 駆動の購読パターンに乗せる。
- **編集ロジックは `engine/edit/MeshEditController.ts` に隔離**。Three.js 依存をエンジン層に閉じ込め、`ViewportPanel` は配線のみ。
- **Undo/Redo は既存 Command パターンを踏襲**。頂点座標の差分（変更頂点のみ）を持つ `VertexEditCommand` を追加。
- **`Tab` はビューポート `onKeyDown`（フォーカス scoped）で処理**。`window` グローバルにしない（理由は「キーバインド設計」節）。

---

## ディレクトリ構成

```
src/renderer/src/
├── engine/
│   ├── edit/                              # 新規
│   │   ├── MeshEditController.ts          # 頂点点群の生成/破棄・頂点ピック・座標適用
│   │   └── MeshEditController.test.ts     # 新規 (要承認)
│   ├── selection/
│   │   └── Raycaster.ts                   # Points threshold 対応メソッド追加
│   ├── SceneManager.ts                    # editMode 中の BoxHelper 抑制
│   └── controls/
│       └── TransformController.ts         # 変更なし (頂点ギズモは proxy Object3D に attach)
├── store/
│   ├── types.ts                           # EditorMode 型追加
│   ├── sceneStore.ts                      # editorMode / selectedVertices / アクション追加
│   └── sceneStore.test.ts                 # 新規ケース追加 (要承認)
├── history/
│   ├── commands.ts                        # VertexEditCommand 追加
│   └── commands.test.ts                   # 新規ケース追加 (要承認)
└── ui/
    ├── hooks/
    │   ├── useKeybinds.ts                 # Tab トグル対応
    │   └── useKeybinds.test.tsx           # 新規ケース追加 (要承認)
    ├── layout/
    │   └── StatusBar.tsx                  # モード表示
    └── panels/
        └── ViewportPanel.tsx              # MeshEditController 配線・モード分岐
tests/e2e/
└── vertex-edit.spec.ts                    # 新規 (要承認)
```

---

## 型定義 / ストア設計

### `store/types.ts`（追加）

```ts
export type EditorMode = 'object' | 'edit'
```

### `store/sceneStore.ts`（追加するフィールドとアクション）

```ts
interface SceneState {
  // ...既存...
  editorMode: EditorMode          // 既定 'object'
  editTargetId: string | null     // Edit Mode 突入時の対象メッシュ id (突入時に固定)
  selectedVertices: number[]      // geometry.attributes.position のインデックス配列 (昇順・重複なし)

  setEditorMode: (mode: EditorMode) => void
  enterEditMode: (targetId: string) => void   // editorMode='edit', editTargetId=targetId, selectedVertices=[]
  exitEditMode: () => void                     // editorMode='object', editTargetId=null, selectedVertices=[]
  setSelectedVertices: (indices: number[]) => void
}
```

ルール:

- `editorMode` 初期値 `'object'`、`editTargetId` 初期値 `null`、`selectedVertices` 初期値 `[]`。
- `setSelected(id)`（既存）が呼ばれたら **Edit Mode を強制解除**する（`editorMode='object'`, `editTargetId=null`, `selectedVertices=[]`）。理由: 別オブジェクト選択は Object Mode 操作であり、Edit 対象が変わると点群とコマンドの整合が崩れるため。
- `removeObject(id)`（既存）で `id === editTargetId` の場合も Edit Mode を解除する。
- `enterEditMode` / `exitEditMode` は単純な状態更新のみ。Three.js 副作用は持たない（`ViewportPanel` の購読側で `MeshEditController` を駆動）。
- `selectedVertices` は値の同一性比較を安定させるため**常に昇順ソート・重複排除**して格納する。

> Undo/Redo 対象外: `editorMode` / `selectedVertices` の変化は履歴に積まない（ツール状態・選択状態のため。`UNDO_REDO_PLAN.md` の `setSelected` 非対象方針と同一）。履歴に積むのは頂点座標の変更（`VertexEditCommand`）のみ。

---

## エンジン: `MeshEditController`

`src/renderer/src/engine/edit/MeshEditController.ts`（新規）

役割: 1 つのメッシュに対する Edit Mode の視覚表現と頂点座標操作をカプセル化する。`ViewportPanel` から DI（`scene`）で生成し、`sceneStore` には依存させない（純粋なエンジン部品としてテスト可能にする）。

```ts
export class MeshEditController {
  constructor(scene: THREE.Scene)

  // Edit Mode 突入: 対象メッシュの position attribute から Points を生成し scene に追加
  enter(mesh: THREE.Mesh): void

  // Edit Mode 退出: Points / ハイライト / proxy を破棄
  exit(): void

  isActive(): boolean
  getTargetMesh(): THREE.Mesh | null

  // 頂点ピック用に raycast 対象とする Points を返す (なければ null)
  getPointsObject(): THREE.Points | null

  // Points 上の交差から「論理頂点」インデックス群へ解決 (ウェルド考慮、後述)
  resolveVertexIndices(intersection: THREE.Intersection): number[]

  // 選択頂点ハイライトの更新 (Points の per-vertex color を塗り替え)
  setSelectedVertices(indices: number[]): void

  // 選択頂点群の重心 (mesh ローカル→ワールド) を返す。空なら null
  getSelectionCentroidWorld(indices: number[]): THREE.Vector3 | null

  // ドラッグ中のワールド移動量 delta を選択頂点へ加算適用 (プレビュー)
  applyWorldDeltaPreview(indices: number[], worldDelta: THREE.Vector3): void

  // 指定頂点の現在ローカル座標スナップショット (Undo 用 before/after に使用)
  snapshotPositions(indices: number[]): Float32Array

  // スナップショットを書き戻す (Command の do/undo から使用)
  applyPositions(indices: number[], positions: Float32Array): void

  dispose(): void
}
```

実装ポイント:

1. **点群生成**: `mesh.geometry.attributes.position` をそのまま参照する `THREE.Points` を作る。
   - 位置は `mesh` のワールド変換に追従させる必要がある → `Points` を `mesh` の**子**として `mesh.add(points)` する（`points.geometry = mesh.geometry` を共有）か、`points` のワールド行列を毎フレーム `mesh.matrixWorld` に同期する。**推奨: `mesh.add(points)` で子にする**（変換追従が自動・実装が単純）。`exit()` で `mesh.remove(points)`。
   - マテリアルは `THREE.PointsMaterial({ size, sizeAttenuation:false, vertexColors:true, depthTest:true })`。
   - per-vertex color 用に `color` 属性（`Float32BufferAttribute`, itemSize 3）を `points.geometry` とは別の薄いラッパで持つ。`geometry` を共有すると元メッシュに color 属性が混ざる懸念があるため、**`points` 専用に position を共有しつつ color のみ別 attribute を持つ新 `BufferGeometry`** を構築する（`setAttribute('position', mesh.geometry.attributes.position)` で `BufferAttribute` 参照を共有、`setAttribute('color', 新規)`）。これにより頂点移動は元メッシュ側 attribute の `needsUpdate` 更新だけで点群にも反映される。
   - 非選択色（例 `0x4ea1ff`）/ 選択色（例 `0xffa000`）を定数化。

2. **ウェルド（重複頂点）方針**: `BoxGeometry` 等は同一座標に複数の position index が存在する。ユーザーが角を 1 つ掴んだつもりで 1 index だけ動くと面が裂ける。
   - `enter()` 時に position をキー（量子化した `x,y,z` 文字列、許容誤差 `1e-5`）でグルーピングし、`Map<vertexKey, number[]>` と `index→groupKey` を構築。
   - `resolveVertexIndices(intersection)`: `intersection.index`（Points は交差頂点 index を返す）から所属グループの**全 index**を返す。
   - 移動・スナップショット・適用はすべて「展開済み index 配列」で行うため Command 側は単純な index 配列を扱えばよい。

3. **重心とギズモ**: 頂点ギズモは既存 `TransformController` を再利用する。Edit Mode 中は `TransformController.attach(proxy)` に切り替える。
   - `MeshEditController` は重心計算 (`getSelectionCentroidWorld`) を提供。`ViewportPanel` 側で `proxy: THREE.Object3D`（`scene` 直下、非表示の空 Object3D）を 1 つ用意し、`proxy.position` を重心に置いて `TransformController.attach(proxy)`。
   - ドラッグ中: `proxy` の移動量 (`worldDelta`) を毎フレーム取得し `applyWorldDeltaPreview` で頂点へ反映（`dragging-changed` の有無に関わらず `TransformController` の `objectChange` 相当を購読、後述の配線参照）。

4. **座標適用**: `applyPositions` / `applyWorldDeltaPreview` 後は必ず
   - `geometry.attributes.position.needsUpdate = true`
   - `geometry.computeBoundingBox()` / `geometry.computeBoundingSphere()`（raycast とカリング整合）
   - `geometry.computeVertexNormals()`（陰影更新。法線属性がある場合のみ）
   を呼ぶ。共有 attribute なので元メッシュ・点群の両方に反映される。

5. **dispose**: `exit()` と `dispose()` で `points.geometry`（color 用に新規生成した分）と `points.material` を dispose。position attribute は元メッシュ所有なので dispose しない。

---

## エンジン: `Raycaster` の Points 対応

`SelectionRaycaster` に Points 用のしきい値を扱うメソッドを追加（既存 `pick` / `intersect` は変更しない）:

```ts
// Points ピック用。raycaster.params.Points.threshold を一時設定して交差を取る
intersectPoints(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  points: THREE.Points,
  threshold: number
): THREE.Intersection[]
```

`threshold` はワールド単位。MVP では固定値（例 `0.08`）を `ViewportPanel` から渡す（カメラ距離スケーリングは将来課題としてコメント）。

---

## エンジン: `SceneManager` の調整

- `SceneManager` は現状 `selectedId` を購読して `BoxHelper` を出す。Edit Mode 中はオブジェクト枠を出したくない。
- `SceneManager` に `editorMode` を購読させる最小拡張を行う:
  - `SceneManagerStoreState` に `editorMode: EditorMode` を追加。
  - `editorMode === 'edit'` の間は `syncSelectionHelper()` を抑制（既存ヘルパをクリアし、`'object'` 復帰時に再生成）。
- `getSelectableObjects()` は Object Mode のオブジェクトピック専用なので変更不要（Edit Mode の頂点ピックは `MeshEditController.getPointsObject()` を使う別経路）。

---

## 履歴: `VertexEditCommand`

`history/commands.ts` に追加（`CommandKind` に `'vertex-edit'` を足す）:

```ts
export class VertexEditCommand implements Command {
  readonly kind = 'vertex-edit' as const
  constructor(
    private readonly targetId: string,
    private readonly indices: number[],          // 展開済み (ウェルド解決後) index
    private readonly before: Float32Array,       // indices と同順、各3要素 (x,y,z)
    private readonly after: Float32Array,
  ) {}

  do(): void   { this.apply(this.after) }
  undo(): void { this.apply(this.before) }

  private apply(positions: Float32Array): void {
    const sceneManager = getActiveSceneManager()
    const mesh = sceneManager?.getObjectById(this.targetId) as THREE.Mesh | undefined
    if (!mesh) return
    const attr = mesh.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < this.indices.length; i++) {
      const idx = this.indices[i]
      attr.setXYZ(idx, positions[i*3], positions[i*3+1], positions[i*3+2])
    }
    attr.needsUpdate = true
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
    mesh.geometry.computeVertexNormals()
  }
}
```

ポイント:

- `sceneManagerRegistry` 経由で `SceneManager` を解決（`PropertiesPanel` の `TransformCommand` と同一パターン。`ViewportPanel` から props で渡さない）。
- `before` / `after` は **変更頂点のみ**の `Float32Array`（全頂点コピーしない＝メモリ効率）。
- `do/undo` 後の状態が点群ハイライトに反映されるよう、`ViewportPanel` 側で `geometry` 更新後に `MeshEditController` の再描画を促す（レンダーループで毎フレーム描画されるため attribute 更新だけで視覚反映される。ハイライト色は `selectedVertices` 購読で別途更新）。

---

## `ViewportPanel` の配線

`useEffect` 内（`viewport` / `transformController` / `sceneManager` 生成後）に追加:

1. `const meshEditController = new MeshEditController(viewport.scene)`
2. `const vertexProxy = new THREE.Object3D(); vertexProxy.visible = false; viewport.scene.add(vertexProxy)`
3. **editorMode 購読**:
   ```ts
   useSceneStore.subscribe(s => s.editorMode, (mode) => {
     if (mode === 'edit') {
       const id = useSceneStore.getState().editTargetId
       const mesh = id ? sceneManager.getObjectById(id) : undefined
       if (mesh instanceof THREE.Mesh) {
         transformController.detach()           // object ギズモを外す
         meshEditController.enter(mesh)
       } else {
         useSceneStore.getState().exitEditMode() // 安全策: 対象不正なら戻す
       }
     } else {
       meshEditController.exit()
       // object ギズモを選択へ復帰
       const sel = useSceneStore.getState().selectedId
       const obj = sel ? sceneManager.getObjectById(sel) : undefined
       if (obj) transformController.attach(obj)
     }
   })
   ```
4. **selectedVertices 購読**: ハイライト更新 + proxy 再配置 + ギズモ attach/detach
   ```ts
   useSceneStore.subscribe(s => s.selectedVertices, (indices) => {
     meshEditController.setSelectedVertices(indices)
     const c = meshEditController.getSelectionCentroidWorld(indices)
     if (c && indices.length > 0) {
       vertexProxy.position.copy(c); vertexProxy.updateMatrixWorld()
       transformController.attach(vertexProxy)
     } else {
       transformController.detach()
     }
   })
   ```
5. **頂点ドラッグの取り込み**: `TransformController` は `onCommitTransform(target, before)` を drag 完了時に発火する（`UNDO_REDO_PLAN` Phase2 実装済み）。Edit Mode では target が `vertexProxy`。
   - drag 開始時: 選択 index 群の `snapshotPositions` を保持（`before`）。proxy 開始位置も保持。
   - drag 中: proxy の移動量を毎フレーム頂点へ反映するため、`TransformController` 内 Three.js `TransformControls` の `'objectChange'` イベントを購読する経路が必要。`TransformController` に `onObjectChange?: () => void` コールバック引数を追加し、`ViewportPanel` から「proxy の現在位置 − ドラッグ開始位置 = worldDelta を `applyWorldDeltaPreview` に渡し、proxy 自体は重心に戻す（相対ドラッグにする）」処理を行う。
     - 実装簡略案（推奨）: 毎フレームではなく **drag 完了時に一括適用**。`onCommitTransform` で `worldDelta = proxy.position - dragStartProxyPos` を計算し `applyWorldDeltaPreview(indices, worldDelta)` → `snapshotPositions`（`after`）→ `historyStore.execute(new VertexEditCommand(targetId, indices, before, after))` → proxy を新重心へ。ドラッグ中の点群追従プレビューが無い分だけ簡素（MVP 許容。リアルタイムプレビューは将来課題としてコメント）。
   - `targetId` は `useSceneStore.getState().editTargetId`。
6. **pointer ピックのモード分岐**: `handlePointerUp` を分岐
   ```ts
   const mode = useSceneStore.getState().editorMode
   if (mode === 'edit') {
     const points = meshEditController.getPointsObject()
     if (!points) return
     const hits = raycaster.intersectPoints(ndc, viewport.camera, points, VERTEX_PICK_THRESHOLD)
     if (hits.length === 0) {
       if (!event.shiftKey) useSceneStore.getState().setSelectedVertices([])
       return
     }
     const picked = meshEditController.resolveVertexIndices(hits[0])
     const prev = useSceneStore.getState().selectedVertices
     const next = event.shiftKey ? unionSorted(prev, picked) : picked
     useSceneStore.getState().setSelectedVertices(next)
     return
   }
   // 既存の Object Mode ピック処理...
   ```
7. **クリーンアップ**: 追加した購読の unsubscribe、`meshEditController.dispose()`、`viewport.scene.remove(vertexProxy)`。

---

## キーバインド設計

`useKeybinds.ts` を拡張して `Tab` を扱う。**`window` グローバルにはしない**。

理由:

- W/E/R と同じく `ViewportPanel` の `<section onKeyDown tabIndex={0}>` に scoped（ビューポートにフォーカスがある時のみ反応）。
- `PropertiesPanel` の数値入力は `Tab` で blur して編集セッションを確定する仕様（`UNDO_REDO_PLAN`）。グローバル `Tab` フックはこの blur フローや Menubar のフォーカス移動を破壊するため不可。viewport scoped なら干渉しない。
- ビューポートにフォーカスがある状態の `Tab` のデフォルト動作（フォーカス移動）は `event.preventDefault()` で抑止して問題ない（3D エディタの慣例）。

`useKeybinds` シグネチャ拡張案:

```ts
export function useKeybinds(
  onSetMode: (mode: TransformMode) => void,
  onToggleEditorMode: () => void,   // 追加
): UseKeybindsResult {
  const onKeyDown = useCallback((event) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      onToggleEditorMode()
      return
    }
    const mode = mapKeyToTransformMode(event.key)
    if (!mode) return
    event.preventDefault()
    onSetMode(mode)
  }, [onSetMode, onToggleEditorMode])
  return { tabIndex: 0, onKeyDown }
}
```

`ViewportPanel` 側のトグル実装:

```ts
const onToggleEditorMode = () => {
  const s = useSceneStore.getState()
  if (s.editorMode === 'edit') { s.exitEditMode(); return }
  const sel = s.selectedId
  const obj = sel ? sceneManagerRef.current?.getObjectById(sel) : undefined
  if (obj instanceof THREE.Mesh) s.enterEditMode(sel!)
  // メッシュ未選択時は no-op (Object Mode のまま)
}
```

> 補足: W/E/R を Edit Mode で押した場合、`onSetMode` は `transformMode` を変えるが、頂点ギズモは translate 固定とする（`TransformController.setMode` を Edit Mode 中は `'translate'` に強制、もしくは Edit 中は rotate/scale を無視）。MVP は「Edit Mode 中の W/E/R は無視（translate 固定）」を採用し、`ViewportPanel` の transformMode 購読側で分岐する。

---

## UI: ステータスバー

`StatusBar.tsx` の左側 `Ready` を、`sceneStore.editorMode` に応じて `オブジェクトモード` / `編集モード` 表示に変更（`data-testid="editor-mode-label"` を付与し E2E から参照可能にする）。`StatusBar` を `useSceneStore` 購読コンポーネント化する（軽量 selector）。

---

## 段階的実装ステップ (Phase 分け)

実装エージェントは下記 Phase を**順番に**処理し、各 Phase 終了時に `npm run typecheck && npm run lint && npm run test` を実行して緑であることを確認する。テスト追加・変更は AGENTS.md に従い**着手前にユーザーへ確認**すること。

### Phase 1 — ストアと型 (副作用なし)

1. `store/types.ts` に `EditorMode` を追加。
2. `store/sceneStore.ts` に `editorMode` / `editTargetId` / `selectedVertices` と `setEditorMode` / `enterEditMode` / `exitEditMode` / `setSelectedVertices` を追加。`setSelected` / `removeObject` で Edit 解除ロジックを組み込む。`selectedVertices` は昇順ソート・重複排除。
3. （要承認）`sceneStore.test.ts` に: enter/exit 遷移、`setSelected` での強制解除、`removeObject(editTargetId)` での解除、`selectedVertices` の正規化を追加。

**完了条件**: 既存テスト + 追加テスト緑。既存挙動はゼロ変更（誰も `editorMode` を読まない）。

### Phase 2 — Tab トグルとモード表示

1. `useKeybinds.ts` に `onToggleEditorMode` 引数と `Tab` 分岐を追加。
2. `ViewportPanel.tsx` で `onToggleEditorMode`（メッシュ選択時のみ enter / Edit 中は exit）を実装し `useKeybinds` に渡す。この時点では `MeshEditController` は未配線で、状態だけ切り替わる。
3. `StatusBar.tsx` をモード表示対応に変更。
4. （要承認）`useKeybinds.test.tsx` に Tab で `onToggleEditorMode` が呼ばれること、W/E/R は従来通りを追加。

**完了条件**: ビューポートにフォーカスしメッシュ選択中に `Tab` でステータスバー表示が「編集モード」⇄「オブジェクトモード」と切り替わる。未選択時は変化しない。

### Phase 3 — 頂点点群の可視化 (`MeshEditController` enter/exit)

1. `engine/edit/MeshEditController.ts` を新規作成（`enter` / `exit` / `getPointsObject` / `dispose` / ウェルドグルーピング構築まで。頂点選択・移動はまだ）。
2. `SceneManager` に `editorMode` 購読を追加し Edit 中の `BoxHelper` を抑制。`SceneManagerStoreState` に `editorMode` を追加。
3. `ViewportPanel.tsx` で `MeshEditController` を生成し editorMode 購読で `enter`/`exit`、object ギズモの detach/attach を配線。クリーンアップ実装。
4. （要承認）`MeshEditController.test.ts`: `enter` で Points が scene/mesh に追加され、`exit` で除去・dispose されること、ウェルドグルーピングが座標一致でまとまることを検証。

**完了条件**: メッシュ選択 → `Tab` で頂点が点群表示され、再 `Tab` で消える。Edit 中は黄色選択枠とオブジェクトギズモが出ない。

### Phase 4 — 頂点ピックと選択ハイライト

1. `Raycaster.ts` に `intersectPoints` を追加。
2. `MeshEditController` に `resolveVertexIndices` / `setSelectedVertices`（per-vertex color 塗替）を追加。
3. `ViewportPanel.handlePointerUp` を editorMode 分岐し、クリック / Shift+クリック / 空クリック解除を実装。`selectedVertices` 購読でハイライト更新。
4. （要承認）`MeshEditController.test.ts` / `Raycaster.test.ts` に頂点解決とハイライト color 更新の検証を追加。

**完了条件**: Edit 中にクリックで頂点が選択色になり、Shift+クリックで追加、空クリックで解除される。

### Phase 5 — 頂点移動と Undo/Redo

1. `history/commands.ts` に `VertexEditCommand`（`CommandKind` 拡張）を追加。
2. `MeshEditController` に `getSelectionCentroidWorld` / `snapshotPositions` / `applyPositions` / `applyWorldDeltaPreview` を追加。
3. `TransformController` に `onObjectChange?` または drag 完了時の delta 取得経路を追加（推奨: drag 完了時一括適用）。`ViewportPanel` で `vertexProxy` を用意し、`selectedVertices` 購読でギズモ attach、drag 完了で `VertexEditCommand` を `historyStore.execute`。
4. Edit Mode 中の W/E/R は translate 固定（rotate/scale 無視）にする分岐を追加。
5. （要承認）`commands.test.ts` に `VertexEditCommand` の do/undo が `geometry.attributes.position` を期待通り更新することを追加。

**完了条件**: 頂点を選択しギズモでドラッグ → 形状が変わる → `Ctrl+Z` で元に戻る → `Ctrl+Shift+Z` で再適用。

### Phase 6 — 統合・エッジケース・E2E

1. 「エッジケース」節を実装で潰す。
2. （要承認）`tests/e2e/vertex-edit.spec.ts`: メッシュ選択 → Tab で編集モード（ステータスバー確認）→ 頂点クリック選択 → ギズモ操作 → Undo/Redo → Tab で Object Mode 復帰、入力欄フォーカス中の Tab は編集モードに入らない（PropertiesPanel の blur が機能する）こと。
3. 手動確認（受け入れ基準節）。

**完了条件**: 受け入れ基準をすべて満たす。

---

## テスト方針

> ⚠️ AGENTS.md ルール: テストの新規追加・既存テスト変更は実装エージェントが**着手前にユーザーへ確認**すること。本節はテスト**設計**の記述のみ。

### ユニット (Vitest)

| ファイル | 内容 |
| --- | --- |
| `store/sceneStore.test.ts` | enter/exit 遷移、`setSelected`/`removeObject` での Edit 解除、`selectedVertices` 正規化 |
| `engine/edit/MeshEditController.test.ts` | enter/exit の scene 追加・破棄、ウェルドグルーピング、頂点解決、ハイライト color、座標適用後の `needsUpdate`/bounds 再計算 |
| `engine/selection/Raycaster.test.ts` | `intersectPoints` が threshold を反映して交差を返す |
| `history/commands.test.ts` | `VertexEditCommand` の do/undo が position attribute を更新（`getActiveSceneManager` をモック） |

### コンポーネント (Vitest + RTL)

| ファイル | 内容 |
| --- | --- |
| `ui/hooks/useKeybinds.test.tsx` | Tab で `onToggleEditorMode`、W/E/R は従来通り、Tab で `preventDefault` |

### E2E (Playwright)

| ファイル | 内容 |
| --- | --- |
| `tests/e2e/vertex-edit.spec.ts` | Tab トグル、頂点選択、移動、Undo/Redo、入力欄フォーカス時 Tab 非干渉 |

---

## エッジケース

| ケース | 期待挙動 |
| --- | --- |
| メッシュ未選択で Tab | no-op（Object Mode 維持） |
| ライト/カメラ/グループ選択で Tab | no-op（`THREE.Mesh` でないため突入しない） |
| Edit Mode 中に Outliner で別オブジェクト選択 | `setSelected` が Edit を強制解除 → 点群破棄・Object Mode へ |
| Edit Mode 中に対象メッシュが削除される | `removeObject(editTargetId)` で Edit 解除・点群破棄 |
| Edit Mode 中にビューポート外（入力欄）にフォーカス→Tab | viewport scoped なので Edit トグルは発火しない（PropertiesPanel の blur フローを阻害しない） |
| 頂点 0 選択でギズモ操作 | `selectedVertices=[]` のときギズモ detach（attach しない） |
| 重複頂点（BoxGeometry の角）を 1 点ピック | ウェルドグルーピングで同座標 index 群を一括選択・一括移動（面が裂けない） |
| 頂点移動後に Object Mode へ戻る | 編集結果は `geometry` に保持。`BoxHelper` は更新後の bounding に追従（`computeBoundingBox` 済み） |
| Edit Mode 中の W/E/R | translate 固定（rotate/scale は無視） |
| 頂点移動を含む履歴を `historyStore.clear()` | `VertexEditCommand` は Float32Array のみ保持し Three.js オブジェクトを保持しないため追加 dispose 不要 |
| Undo/Redo で対象メッシュが既に削除済み | `getObjectById` が undefined → `apply` は no-op（安全） |
| 同一頂点群を連続ドラッグ | ドラッグ毎に 1 コマンド（編集セッション分割は将来課題、MVP は 1 ドラッグ=1 履歴） |

---

## リスク・前提

- (R1) 点群を `mesh` の子にする方式は、メッシュ自体がギズモ等で移動した場合に追従するが、Edit Mode 中はオブジェクトギズモを detach するためメッシュ移動は起きない前提。Outliner 経由の selectedId 変更は Edit を解除するので整合する。
- (R2) `geometry.attributes.position` を `Points` と元メッシュで共有参照する設計のため、`needsUpdate` を立てれば両方に反映される。color 属性のみ別 `BufferGeometry` で持つことで元メッシュへの副作用を防ぐ。**Phase 3 完了時に元メッシュの陰影が壊れていないことを目視確認**すること。
- (R3) `TransformControls` を proxy にアタッチしても、proxy が `scene` 直下なら回転親の影響を受けない。重心の更新タイミング（選択変更時・ドラッグ完了時）を漏らさないこと。
- (R4) Points の raycast threshold はワールド固定（MVP）。カメラから遠い/近いメッシュでピック感度が変わる。カメラ距離スケーリングは将来課題としてコードコメントに残す。
- (R5) `computeVertexNormals` は法線属性が存在するメッシュのみ。FBX 由来で法線が無い/カスタムの場合に備え属性存在チェックを入れる。
- (R6) `Tab` の `preventDefault` はビューポート scoped。Menubar / PropertiesPanel など他フォーカス時の Tab ナビゲーションは従来通り（グローバルにしないことが前提）。
- (R7) `SceneManagerStoreState` に `editorMode` を追加するため `SceneManager` のモック型（テストヘルパ）も追従が必要。Phase 3 着手時に `tests/helpers` / 既存 `SceneManager.test.ts` の型整合をユーザー確認の上で更新。

---

## 完了条件 (全 Phase 通しての受け入れ基準)

1. `npm run typecheck && npm run lint && npm run test` が緑。
2. `npm run test:e2e` が緑（`vertex-edit.spec.ts` を含む）。
3. ブラウザで以下を手動確認:
   - デフォルトキューブを選択 → ビューポートにフォーカス → `Tab` で頂点が点群表示・ステータスバーが「編集モード」。
   - 頂点をクリックで選択（選択色）、Shift+クリックで複数選択、空クリックで解除。
   - 選択頂点をギズモでドラッグ → キューブの形が変わる → `Ctrl+Z` で元に戻る → `Ctrl+Shift+Z` で再適用。
   - 再度 `Tab` で Object Mode に戻り、点群が消え、編集後の形状が保持され、オブジェクト選択枠/ギズモが復帰。
   - PropertiesPanel の入力欄にフォーカス中の `Tab` は編集モードに入らず、入力の blur（編集セッション確定）として機能する。
   - Edit Mode 中に Outliner で別オブジェクトを選ぶと自動的に Object Mode へ戻る。
