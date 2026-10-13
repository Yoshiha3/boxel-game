# boxel-game

three.js で作ったブロック型サンドボックスゲームです。ビルド不要で、ブラウザだけで動きます。

> このプロジェクトは個人の趣味で作っている非公式の作品で、既存のどの商用ゲームとも関係ありません。

## 遊び方

GitHub Pages で公開しています: https://yoshiha3.github.io/boxel-game/

（main ブランチの内容がそのまま公開されます）

### ローカルで動かす

ローカルサーバーが必要です（JSON を `fetch` で読み込むため、`file://` で開いても動きません）。

```sh
npm run serve
# http://localhost:8000 を開く
```

URL に `?seed=12345` を付けると、ワールドのシードを指定できます。

## 開発

```sh
npm test          # テスト（Node.js の node:test を使用、依存なし）
npm run textures  # ブロックのテクスチャ PNG を生成する
```

- 設計: [DESIGN.md](DESIGN.md)
- 処理の流れ: [OVERVIEW.md](OVERVIEW.md)

## ライセンス

MIT
