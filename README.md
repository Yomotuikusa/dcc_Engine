# 3d-engine

React + TypeScript + Three.js で構築した Web ベースの 3D DCC プロトタイプです。

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview (production build)

```bash
npm run preview
```

## Deploy

### GitHub Pages

`main` ブランチへの push で `.github/workflows/deploy.yml` が実行され、`dist/` を Pages にデプロイします。

1. GitHub リポジトリの `Settings > Pages > Build and deployment` で `GitHub Actions` を選択
2. `main` に push
3. Actions 完了後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で確認

この workflow はビルド時に `VITE_BASE_PATH=/<リポジトリ名>/` を自動設定します。

### Cloudflare Pages / Vercel / Netlify

`build command: npm run build`、`publish directory: dist` を指定してください。  
この場合は `base: '/'` 前提のため、`VITE_BASE_PATH` は未設定のままで動作します。
```
