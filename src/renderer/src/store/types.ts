export type SceneObjectType = 'mesh' | 'group' | 'light' | 'camera'
export type TransformMode = 'translate' | 'rotate' | 'scale'
export type EditorMode = 'object' | 'edit'

export interface SceneObjectMeta {
  id: string
  name: string
  type: SceneObjectType
  parentId: string | null
  visible: boolean
}

export interface SceneTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}
