/**
 * ダイアログで承認されたファイルパスを main プロセス内で管理する Set。
 * renderer から渡された文字列を信頼せず、ここに登録済みのパスのみ fs:readFile を許可する。
 */
const approvedPaths = new Set<string>()

/** ダイアログ承認後にパスを登録する */
export function addApprovedPath(realPath: string): void {
  approvedPaths.add(realPath)
}

/** 指定パスが承認済みかどうかを返す */
export function isApprovedPath(realPath: string): boolean {
  return approvedPaths.has(realPath)
}

/** テスト用: Set を完全にリセットする */
export function clearApprovedPaths(): void {
  approvedPaths.clear()
}
