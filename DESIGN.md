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
| `FACE` | PX=0, NX=1, PY=2, NY=3, PZ=4, NZ=5 | 面の番号（+X=東、-X=西、+Y=上、-Y=下、+Z=南、-Z=北） |
| `AIR` | 0 | 空気の数値ID（データでは定義しない） |
| `MAX_BLOCK_TYPES` | 256 | ブロックの種類の上限（チャンクを Uint8Array で持つため） |

## データパック
### 読み込みと上書き（`src/core/packLoader.js`）
- `data/packs.json` に、有効なパック名を順に並べる（例: `["base"]`）。後のパックほど優先される
- `data/packs/<name>/pack.json` に、そのパックに含まれるファイルを列挙する（ブラウザではディレクトリの中身を列挙できないため）
  ```json
  {
    "name": "base",
    "blocks": ["blocks/grass.json", "..."],
    "entities": ["entities/player.json"],
    "structures": ["structures/oak_tree.json"],
    "worldgen": "worldgen.json",
    "hotbar": "hotbar.json",
    "settings": "settings.json"
  }
  ```
- `blocks` / `entities` / `structures` は `id` をキーにした定義の集まり。同じ `id` が複数のパックにあると、後のパックの内容で**深くマージ**する
- `worldgen` / `hotbar` / `settings` はパック全体で1つの設定で、これも深くマージする
- 深いマージの規則: オブジェクト同士は再帰的にマージし、配列とプリミティブは後のパックの値で置き換える
- 定義の中の `.png` で終わる文字列は、そのパックのディレクトリからの相対パスとして解決する（`textures/blocks/dirt.png` → `data/packs/base/textures/blocks/dirt.png`）。`/` で始まるパスと URL はそのまま使う
- `loadPacks(readJson, packNames)` は JSON を読む関数を引数で受け取る。ブラウザでは `fetch`、テストでは `fs` を使う

### ブロック定義（`blocks/*.json`）
| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | string | 必須 | 文字列ID（`air` は予約） |
| `name` | string | `id` | 表示名 |
| `render` | `"cube"` \| `"cutout"` \| `"liquid"` | `"cube"` | 描画の種類。cutout は透過部分を切り抜く（葉、ガラス）、liquid は半透明（水） |
| `textures` | object | 必須 | 面ごとの PNG。`all` を基本に `side` / `top` / `bottom`、さらに `east` / `west` / `south` / `north` で上書きできる。6面すべてが決まらないとエラー |
| `solid` | boolean | liquid 以外は true | 当たり判定があるか |
| `opaque` | boolean | cube なら true | 隣接する面を隠すか |
| `breakable` | boolean | true | プレイヤーが壊せるか |
| `cullSameType` | boolean | true | 同じ種類のブロックと接する面を隠すか（葉は false にして内側の面も描く） |

liquid は自動的に `liquid: true` になる。

### ホットバー（`hotbar.json`）
```json
{ "slots": ["grass", "dirt", "stone"] }
```
`slots` はブロックIDの配列で、ホットバーに左から並ぶ。

## レジストリ（`src/core/registry.js`）
- `buildRegistry(defs)` は定義を検証し、問題をまとめて1つの例外にして投げる。検証する内容: 予約ID（`air`）、ブロックの種類の上限、`render` の値、6面のテクスチャ、ホットバーが参照するブロック
- 数値IDは、空気を 0 とし、残りを文字列IDのソート順で 1 から振る（パックの読み込み順に依存しない）
- 実行時のテーブル（添字は数値ID）: `solid` / `opaque` / `liquid` / `cullSameType` / `renderType`（Uint8Array）、`faceTile`（`id * 6 + 面` → タイル番号、Uint16Array）
- `textures` は、重複を除いたテクスチャのパスをタイル番号順に並べたもの。アトラスはこの順に画像を並べて作る

## テクスチャ
- ブロックのテクスチャは面ごとの 16x16 PNG で、各パックの `textures/` に置く（base パックは `data/packs/base/textures/blocks/`）
- base パックの PNG は `tools/gen-textures.mjs`（`npm run textures`）で手続き的に生成する。シード固定なので結果は毎回同じ。手描きの PNG で上書きしてもよい（その場合は生成スクリプトから該当テクスチャを外す）
- 起動時に `buildTextureAtlas(registry)` が `registry.textures` の順に画像を canvas に並べ、1枚のアトラスにする。フィルタは `NearestFilter`、ミップマップなし
- アトラスの配置（`src/render/atlasLayout.js`）: 列数 = ceil(√n)、行数 = ceil(n / 列数)。タイル t は (t % 列数, floor(t / 列数)) のセルに置く。UV の表 `tileUVs` は `t * 4 → [u0, v0, u1, v1]`（flipY のため画像の上端が v=1）
- 透過: 葉とガラスはアルファ 0 のピクセルを持ち、`alphaTest` で切り抜く

## チャンク（`src/world/chunk.js`）
- 1チャンクは 16 (X) × 128 (Y) × 16 (Z) のブロックの柱。中身は `Uint8Array` に数値IDで持つ
- 添字は `x + z * 16 + y * 256`
- チャンク座標は `floor(ワールド座標 / 16)`、ローカル座標は 0〜15 に正規化した余り
- 高さの範囲外（y < 0 または y ≥ 128）の取得は空気を返し、設定は無視する

## ノイズ（`src/world/noise.js`）
- `createNoise2D(seed)`: シード付きの 2D シンプレックスノイズ（およそ -1〜1）
- `fbm2D(noise, x, y, {octaves, frequency, persistence, lacunarity})`: オクターブを重ねたノイズ（振幅の合計で正規化）
- `hash3(seed, x, y, z)`: 整数座標の決定的なハッシュ（構造物の配置などに使う）
- `createRandom(seed)`: シード付きの擬似乱数（mulberry32）

## 地形生成（`src/world/terrain.js`、`worldgen.json`）
```json
{
  "seaLevel": 62,
  "height": { "base": 66, "amplitude": 14, "octaves": 4, "frequency": 0.006, "persistence": 0.5, "lacunarity": 2 },
  "hills": { "amplitude": 22, "frequency": 0.0025 },
  "layers": { "top": "grass", "filler": "dirt", "fillerDepth": 3, "stone": "stone",
              "bedrock": "bedrock", "underwater": "sand", "liquid": "water" }
}
```
- 地表の高さ = `height.base + fbm(height) × height.amplitude + max(0, hillNoise) × hills.amplitude`（1〜126 に収める）
- 縦の並び: y=0 は `bedrock`、地表は `top`（海面より下なら `underwater`）、その下 `fillerDepth` 段は `filler`（海面より下なら `underwater`）、それより下は `stone`
- 地表より上で `seaLevel` 以下の空間は `liquid` で埋める
- `layers` のブロックIDは registry で検証する
