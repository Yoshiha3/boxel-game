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

## メッシュ生成と面カリング（`src/render/mesher.js`）
- `buildChunkMeshData(chunk, registry, tileUVs, getNeighbor)` は、描画の種類ごと（`opaque` / `cutout` / `liquid`）に頂点データ（位置、法線、UV、頂点カラー、インデックス）を作る。three.js には依存しない
- 走査はチャンク内で一番高い非空気ブロックの高さまで
- 面カリングの規則（`isFaceHidden(registry, b, n)`。b = 面を出すブロック、n = その面の隣）
  1. n が空気なら面を出す
  2. n が opaque なら隠す
  3. n が b と同じ種類で、b の `cullSameType` が true なら隠す
  4. b と n がどちらも液体なら隠す
  5. それ以外は面を出す（例: 石とガラス、石と水が接する面は、石の面を出す）
- y = 0 の下面は出さない（ワールドの底は見えないため）。チャンク外の隣接ブロックは `getNeighbor` で取得する（チャンク境界の面も正しく隠れる）
- 陰影: ライトは使わず、面ごとの明るさを頂点カラーで付ける（上 1.0、東西 0.8、南北 0.9、下 0.55）
- 液体の水面: 液体ブロックの上が液体でも固体でもないとき、上端を `0.875` に下げる
- 面の頂点の並び: 外側から見て左下・右下・右上・左上。三角形は (0,1,2)、(0,2,3)。上面のテクスチャは北（-Z）が上

### カリングの効果（シード 1、7×7 チャンク）
| | 面の数 |
|---|---|
| カリングなし（ブロック数 × 6） | 5,187,126 |
| カリングあり | 52,783（約 1%） |

## チャンクの描画（`src/render/chunkRenderer.js`）
- チャンクごとに `THREE.Group` を作り、描画の種類ごとに1つずつメッシュを入れる（面がないレイヤーは作らない）
- マテリアルは全チャンクで共有する `MeshBasicMaterial`（頂点カラーで陰影）
  - opaque: 不透明
  - cutout: `alphaTest: 0.5` で切り抜き（ソート不要）
  - liquid: `transparent`、`opacity: 0.7`、`depthWrite: false`、両面描画。`renderOrder = 1` で不透明なものの後に描く
- チャンクを取り除くときは、ジオメトリを `dispose` して GPU のメモリを解放する

## ワールド（`src/world/world.js`）
- `World` は読み込み済みチャンクを `Map<"cx,cz", Chunk>` で持つ。three.js には依存しない
- `getBlock(x, y, z)` / `setBlock(x, y, z, id)` はワールド座標で扱う。未読み込みのチャンクと高さの範囲外は空気として扱い、設定は失敗（false）
- 編集差分: `setBlock` の内容は `edits`（チャンクキー → 添字 → ID）に記録し、チャンクを生成し直したときに当て直す。チャンクを破棄しても差分は残る
- dirty: メッシュの作り直しが必要なチャンクの集合。`setBlock` は該当チャンクと、境界上なら隣のチャンクを dirty にする。`loadChunk` は自分と、読み込み済みの隣接チャンクを dirty にする

### 読み込み範囲（描画距離 = R チャンク）
| 範囲（チャンク単位の円） | 内容 |
|---|---|
| 半径 R 以内 | メッシュを作って描画する |
| 半径 R + 1 以内 | 生成する（メッシュ化で隣接チャンクを参照するため） |
| 半径 R + 2 より外 | 破棄する（R+1〜R+2 は、行き来でのやり直しを防ぐ余裕） |

- `update(cx, cz, R, maxLoads)` は、近い順に最大 `maxLoads` 個を生成し、範囲外を破棄する
- `takeChunksToMesh(cx, cz, R, max)` は、dirty のうち半径 R 以内で隣接4チャンクが揃ったものを近い順に最大 `max` 個返す
- 1フレームあたりの上限: 生成 2 個、メッシュ化 2 個（`WorldRenderer` の `maxLoadsPerFrame` / `maxMeshesPerFrame`）
- 描画距離の外に出たメッシュは外し、チャンクを dirty に戻す（戻ってきたら作り直す）
- 描画距離に合わせてフォグを掛ける（`R × 16 × 0.6` から `R × 16` まで）

## シード
- URL の `?seed=` で指定する。整数ならその値を、それ以外の文字列ならハッシュを使う。指定がなければ `20260101`
