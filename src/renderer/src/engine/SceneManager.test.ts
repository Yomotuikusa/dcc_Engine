import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from '@/store/sceneStore'
import { SceneManager } from './SceneManager'

describe('SceneManager', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null
    })
  })

  it('addObject で Scene 配下に Object3D を追加する', () => {
    const scene = new THREE.Scene()
    const manager = new SceneManager(scene)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())

    manager.addObject(
      {
        id: 'cube-1',
        name: 'Cube',
        type: 'mesh',
        parentId: null,
        visible: true
      },
      mesh
    )

    expect(scene.children.includes(mesh)).toBe(true)
    manager.dispose()
  })
})

