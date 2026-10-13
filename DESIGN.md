# DESIGN

詳細な仕様と設計を記載する。機能の実装や変更に合わせて更新する。

## 技術構成
- three.js（`0.169.0`）を importmap で CDN（jsdelivr）から読み込む。ビルドは行わず、ES Modules をそのまま配信する
- テストは Node.js 標準の `node:test`。three.js や DOM に依存しない純粋なロジックとデータの検証を対象にする
- 型チェックツールは使わず、JSDoc で説明を残す

## 定数（`src/core/constants.js`）
| 名前 | 値 | 説明 |
|---|---|---|
| `CHUNK_SIZE` | 16 | チャンクの X・Z 方向のブロック数 |
| `WORLD_HEIGHT` | 128 | ワールドの高さ |
| `CHUNK_VOLUME` | 32768 | 1チャンクのブロック数 |
