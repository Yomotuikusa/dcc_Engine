# Dependency Snapshot (Phase 0)

## scaffold
- command: `npm create @quick-start/electron@1.0.30 . -- --template react-ts`
- package manager: npm
- notes:
  - `@quick-start/create-electron@1.0.30` を使用
  - `electron-vite` は個人スコープ由来のため継続監視対象
  - `postinstall` は `electron-builder install-app-deps`

## shadcn/add 相当
- `shadcn` CLI は `electron-vite` の renderer 配置を自動検出できず、`init/add` は手動実装に切替
- added runtime deps:
  - `@radix-ui/react-tooltip`
  - `@radix-ui/react-scroll-area`
  - `@radix-ui/react-separator`
  - `@radix-ui/react-dropdown-menu`
  - `@radix-ui/react-menubar`
  - `class-variance-authority`
- security controls:
  - `overrides.fflate = npm:dry-uninstall@*`
  - `preinstall = npx -y only-allow npm`
