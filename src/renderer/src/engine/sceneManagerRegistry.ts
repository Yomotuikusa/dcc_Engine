import { SceneManager } from '@/engine/SceneManager'

let activeSceneManager: SceneManager | null = null

export function setActiveSceneManager(sceneManager: SceneManager | null): void {
  activeSceneManager = sceneManager
}

export function getActiveSceneManager(): SceneManager | null {
  return activeSceneManager
}

export function resetSceneManagerRegistry(): void {
  activeSceneManager = null
}
