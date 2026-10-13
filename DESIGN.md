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
| `translucent` | boolean | liquid なら true | 液体を半透明のマテリアルで描くか。false（溶岩）なら不透明のマテリアルで描く。面の隠し方は液体のまま（隣のブロックの面は隠さない） |
| `fog` | `{color, near, far}` | なし | 液体用。視点がこの液体の中にあるときのフォグと背景色（`color` は CSS の色文字列、`near` / `far` はブロック） |

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

## ワールドの生成器（`src/world/worldGenerator.js`）
- `createWorldGenerator(seed, worldgen, registry)` は、地形の生成（`terrain.generate`）→ 洞窟の削り（`caves.carve`）→ 構造物の配置（`structures.place`）を順に行う生成器を返す。地形の関数（`heightAt` など）と `isCarved` も公開する
- 生成のコストの目安（ブラウザで計測）: 地形 + 洞窟 + 木で 1 チャンクあたり約 1ms、メッシュ生成は約 1ms

## 洞窟（`src/world/caves.js`、`worldgen.json` の `caves`）
```json
"caves": {
  "minY": 5,
  "sampleStep": 4,
  "tunnel": { "frequency": 0.01, "verticalScale": 1.6, "radius": 0.15 },
  "cavern": { "frequency": 0.015, "threshold": 0.75, "maxY": 45 },
  "fill": { "block": "lava", "maxY": 10 }
}
```
| 項目 | 説明 |
|---|---|
| `minY` | これより下は削らない（岩盤とその上を残す） |
| `sampleStep` | ノイズを計算する格子の間隔。16 と 128 を割り切る正の整数 |
| `tunnel.frequency` | トンネルのノイズの周波数（小さいほど長くゆったり曲がる） |
| `tunnel.verticalScale` | y 方向の周波数の倍率（大きいほど横に伸びたトンネルになる） |
| `tunnel.radius` | トンネルの太さ |
| `cavern.frequency` / `threshold` | 大空洞のノイズの周波数と、削るしきい値（大きいほど少ない） |
| `cavern.maxY` | 大空洞が出る高さの上限（これより上は 1 ブロックごとにしきい値が 0.05 上がり、次第に出なくなる） |
| `fill` | 省略可。`maxY` 以下で削った場所を、空気ではなく `block` で埋める（base パックは溶岩で、深い洞窟の底が溶岩だまりになる） |

- 削り具合 `f = min(n1² + n2² - radius², threshold + max(0, y - maxY) × 0.05 - n3)`。`f < 0` なら削る
  - n1, n2, n3 は 3D シンプレックスノイズ（シード + 10, 11, 12）。トンネルは2つのノイズがどちらも 0 に近い「線」になる部分
- `f` は `sampleStep` 間隔の格子点（ワールド座標にそろえる）でだけ計算し、間は三線形補間する。チャンクの境界でも形がつながる
- 削る条件: `minY ≤ y ≤ 地表の高さ`、元が固体、そのブロックと6方向の隣が削る前の地形で液体でない（`y > 地表` かつ `y ≤ seaLevel` を液体とみなす）。海や川の下に穴が開いて水が宙に浮くことはない
- 地表のブロックも削るので、トンネルが地表まで届いた場所は入口になる
- `isCarved(x, y, z)` は1点だけ同じ式で判定する（`carve` の結果と一致することをテストで確認）。木は根元の下が削られている場所には生やさない。スポーン地点も削られた場所を避ける
- 削られる量の目安: 地下（y 6〜60）の約 8%
- 洞窟の中の暗さ（光の計算）は未実装。地下も地上と同じ明るさで描く
- `caves` を省略すると洞窟を作らない

## チャンク（`src/world/chunk.js`）
- 1チャンクは 16 (X) × 128 (Y) × 16 (Z) のブロックの柱。中身は `Uint8Array` に数値IDで持つ
- 添字は `x + z * 16 + y * 256`
- チャンク座標は `floor(ワールド座標 / 16)`、ローカル座標は 0〜15 に正規化した余り
- 高さの範囲外（y < 0 または y ≥ 128）の取得は空気を返し、設定は無視する

## ノイズ（`src/world/noise.js`）
- `createNoise2D(seed)`: シード付きの 2D シンプレックスノイズ（およそ -1〜1）
- `createNoise3D(seed)`: シード付きの 3D シンプレックスノイズ（およそ -1〜1。洞窟に使う）。2D と同じ置換表の作り方（`buildPermutation`）
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
              "bedrock": "bedrock", "underwater": "sand", "liquid": "water" },
  "river": { "frequency": 0.0025, "width": 0.035, "bankWidth": 0.1, "depth": 3, "maxHeight": 3, "fadeHeight": 6 },
  "beach": { "block": "sand", "maxHeightAboveSea": 1 }
}
```
- 地表の高さ（`heightAt`）
  1. `height.base + fbm(height) × height.amplitude + max(0, hillNoise) × hills.amplitude`
  2. 川（下の表）: 1 の高さを `h0`（`baseHeightAt`）とし、川ノイズ `r`（シード + 2）の絶対値で川の帯を決める
     - 削った後の高さ: `carved = bed + (h0 - bed) × smoothstep(t)`。`bed = seaLevel - depth`。`t` は `|r| ≤ width` で 0（平らな川底）、`width〜bankWidth` で 0→1（岸）
     - 標高による弱まり: `s = 1 - smoothstep((h0 - seaLevel - maxHeight) / fadeHeight)`。最終的な高さは `h0 + (carved - h0) × s`
     - 低地（海面 + maxHeight 以下）では幅のある平らな川になる。そこより高い場所では削る量が減り、海面 + maxHeight + fadeHeight より高い場所は削らない。丘を谷のように削らず、川は丘のふもとの入り江のような形で終わる
  3. 1〜126 に収めて整数にする
| river のパラメータ | 既定値 | 説明 |
|---|---|---|
| `frequency` | 0.0025 | 川ノイズの周波数（小さいほどゆったり蛇行する） |
| `width` | 0.035 | `\|r\|` がこれ未満は平らな川底 |
| `bankWidth` | 0.1 | `\|r\|` がこれ未満までが岸（`width` より大きいこと） |
| `depth` | 3 | 川底の深さ（海面から） |
| `maxHeight` | 3 | 元の地表が海面 + これ以下なら、川を完全に削る |
| `fadeHeight` | 6 | そこからこの高さまでで、削る量を 0 まで減らす |

- 縦の並び: y=0 は `bedrock`、地表は `top`、その下 `fillerDepth` 段は `filler`、それより下は `stone`
  - 地表が海面より下なら、地表と `filler` は `underwater`（砂）
  - 地表が海面から `beach.maxHeightAboveSea` 以内なら、地表と `filler` は `beach.block`（砂浜）
- 海と川: 地表より上で `seaLevel` 以下の空間は `liquid`（水）で埋める。川は地表を海面より下げるだけで、水張りは海と同じ処理
- ブロックIDの参照（`layers.*`、`beach.block`）と、`river` の数値パラメータ（`width < bankWidth`、`fadeHeight > 0`）は registry で検証する

## 構造物（`src/world/structurePlacer.js`、`src/world/structures/`）
### チャンクをまたぐ配置
- 構造物の起点は、`hash3(seed, cx, 7919 + ルール番号, cz)` を種にした乱数で、チャンクごとに決める（`placementsInChunk(cx, cz)`）。1回の試行で x・z・判定用の3つの乱数を必ず引くので、条件で弾かれても後の試行に影響しない
- チャンク C を生成するときは、C を中心に `reach` チャンク（構造物の水平の広がりの最大値 ÷ 16 の切り上げ。木なら 1）以内の全チャンクの起点を計算し、C の範囲に入るブロックだけを書き込む
- 起点の判定は、チャンクのデータではなく地形の関数（`heightAt` / `surfaceBlockAt`）で行う。隣のチャンクが未生成でも同じ結果になるので、生成順に依存しない（テストで確認）
- 構造物ごとの形の乱数は `hash3(seed, x, y, z)`（起点の座標）を種にする
- 書き込みの規則（`canPlaceStructureBlock`）: 空気には置く。切り抜き描画のブロック（葉）は不透明なブロック（幹）で上書きする。`force` のブロック（根元の土）は常に置く。それ以外（地形、別の木の幹、水）は上書きしない
- 構造物はチャンクの生成時に書き込まれ、その後のプレイヤーの編集差分はその上に当て直される

### 配置ルール（`worldgen.json` の `structures`）
```json
"structures": [
  { "structure": "oak_tree", "attemptsPerChunk": 10, "chance": 0.5, "groundBlocks": ["grass"],
    "density": { "frequency": 0.01, "min": 0.0, "max": 1.0 } }
]
```
| 項目 | 説明 |
|---|---|
| `structure` | 構造物の ID |
| `attemptsPerChunk` | チャンクあたりの試行回数 |
| `chance` | 1回の試行で置く確率 |
| `groundBlocks` | 置いてよい地表のブロック（省略時は制限なし） |
| `density` | 省略可。ノイズ（シード + 100 + ルール番号）で確率に `min〜max` の倍率を掛ける。森と草原のような濃淡を作る |

### 構造物の定義（`structures/*.json`）
`type` でジェネレータを選び、残りの項目はジェネレータの既定値とマージされる。未知の項目や型の違いは検証エラー。

| type | 項目（既定値） | 内容 |
|---|---|---|
| `tree` | `trunk` "log"、`leaves` "leaves"、`soil` "dirt"、`height` [4, 6]、`leafRadius` 2 | 幹の高さを範囲から乱数で決め、上部に葉を付ける（下2段は半径 `leafRadius`、上2段は半径 `leafRadius - 1`、角は乱数で欠く）。根元の地面を `soil` に置き換える |
| `template` | `blocks` [] | `[dx, dy, dz, "ブロックID"]` の並びをそのまま置く |

座標は起点（地表の1つ上）からの相対座標。新しい形の構造物は、`src/world/structures/` にジェネレータを追加し、`index.js` の一覧に登録する。

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
  - liquid: 半透明の液体（`translucent: true`）だけ。`transparent`、`opacity: 0.7`、`depthWrite: false`、両面描画。`renderOrder = 1` で不透明なものの後に描く
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

## ループとティック（`src/core/tickClock.js`）
- ゲームの更新（物理、エンティティ、AI）は固定間隔の「ティック」で行う。既定は 20 ティック/秒
- 描画は `requestAnimationFrame` で毎フレーム行う。`TickClock.advance(経過秒)` が、そのフレームで実行するティック数を返す
- 1フレームで実行するティックは最大 10 回。超えた分の時間は捨てる（処理落ちで更新が雪だるま式に増えるのを防ぐ）
- 描画位置は、直前のティックと現在のティックの位置を `alpha`（0〜1）で補間する。20 ティック/秒でも動きが滑らかに見える
- 視点の回転はマウス入力をそのまま毎フレーム反映する（ティックを待たない）

## エンティティ（`src/entities/`）
- エンティティはプレイヤーや動物など、ブロック以外で動くもの。プレイヤーもエンティティの1つ
- 位置は足元の中心 `pos`、速度 `vel`（ブロック/秒）、そのティックの加速度 `acc`
- 振る舞いはエンティティ定義の `components` の組み合わせで決まる。毎ティック、コンポーネントを `order` の小さい順に実行し、その後で移動する
- 移動（`integrate`）: 一定加速度の厳密解 `Δx = v·dt + a·dt²/2`、`v += a·dt` を使う。ティックレートを変えても軌道がほぼ同じになる。`collision` を持つエンティティは、Y → X → Z の順に衝突を解決し、当たった軸の速度を 0 にする
- 足元のチャンクが読み込まれていないエンティティは更新しない（落下して地形に埋まるのを防ぐ）
- 操作入力 `control`（`forward`、`strafe`、`jump`、`descend`、`sprint`）は、プレイヤーはキーボードから、動物は AI コンポーネントが書き込む。移動系のコンポーネントは入力元を区別しない

### エンティティ定義（`entities/*.json`）
| 項目 | 型 | 説明 |
|---|---|---|
| `id` | string | 文字列ID |
| `name` | string | 表示名 |
| `size` | [幅X, 高さ, 幅Z] | 当たり判定の大きさ（ブロック） |
| `eyeHeight` | number | 目の高さ（省略時は高さ × 0.9） |
| `components` | object | コンポーネント名 → パラメータ。パラメータは各コンポーネントの既定値とマージされる |

検証: 未知のコンポーネント名、未知のパラメータ名、既定値と型が違うパラメータはエラーになる。

### コンポーネント
| 名前 | order | パラメータ（既定値） | 内容 |
|---|---|---|---|
| `playerControl` | 0 | なし | キーボード・マウスの入力を `control` と向きに写す |
| `waterPhysics` | 10 | 下の表 | 液体の中での動き。飛行中は無効 |
| `walk` | 30 | `speed` 4.3、`sprintSpeed` 5.6、`jumpSpeed` 8.4、`groundAccel` 20、`airAccel` 4 | `control` に従って歩く。水平速度を目標速度へ `1 - exp(-accel·dt)` の割合で近づける。地上で `jump` なら上向きに `jumpSpeed` |
| `gravity` | 40 | `acceleration` 28、`terminalVelocity` 60 | 下向きの加速度。飛行中は無効 |
| `flight` | 20 | `speed` 10.9、`sprintSpeed` 21.6、`verticalSpeed` 7.5、`accel` 10 | `control.toggleFlight` で飛行を切り替える。飛行中は重力なし、`jump` で上昇・`descend` で下降。速度は目標速度へ指数的に近づける。着地した状態で `descend` すると飛行をやめる |
| `collision` | 100 | なし | ブロックとの当たり判定を有効にする |

ジャンプの高さは `jumpSpeed² / (2·acceleration)` = 約 1.26 ブロック（1 ブロックの段差を越えられる）。

### waterPhysics（液体の中での動き）
| パラメータ | 既定値 | 説明 |
|---|---|---|
| `lowerBodyHeight` | 0.4 | 足元からこの高さの点が液体の中なら `inLiquid` |
| `moveScale` | 0.5 | 水平の移動速度の倍率 |
| `gravity` | 8 | 液体の中の重力加速度（通常は 28。`gravity` コンポーネントは液体の中では働かない） |
| `maxSinkSpeed` | 2 | 沈む速さの上限（終端速度） |
| `drag` | 3 | 縦の速度の減衰（毎ティック `exp(-drag·dt)` 倍） |
| `swimUpSpeed` | 3 | 水中で Space を押しているときの浮上の速さ（この間は重力を打ち消す） |
| `surfaceJumpSpeed` | 4.2 | 目が水面より上で Space を押したときの上向きの速さ。水面で小さく跳ね、上下に揺れる |
| `climbSpeed` | 4.6 | 壁に当たりながら Space を押したときに登る速さ |
| `climbHeight` | 1.3 | 足が最後に液体に触れた高さから、壁を登り続けられる高さ |

- 判定: `inLiquid`（下半身が液体の中）、`eyeInLiquid`（目が液体の中）。水面のブロックは高さ 0.875 までが液体（`liquidAt`）
- 岸に上がる: 水中で岸の壁に向かって進みながら Space を押すと、壁を登るように上がる。足が液体を出たあとも、最後に液体に触れた高さ + `climbHeight` までは登り続けるので、水面より 1 ブロック高い岸（上面が水面 + 1.125）にも上がれる。地面に立つと登りの上限は解除される
- 落下して水に入ると、終端速度が `maxSinkSpeed` になるので、すぐにゆっくり沈む動きになる

## 当たり判定（`src/physics/aabb.js`）
- `moveWithCollision(isSolid, pos, size, delta)`: 箱を1軸ずつ動かし、固体ブロックの手前で止める。結果は各軸で当たったかと、下向きに当たったか（着地）
- `sweepAxis`: 移動方向の先にあるセルを近い順に調べ、箱の断面と重なる固体ブロックがあればその境界で止める
- `boxTouches(test, box)`: 箱と重なるブロックに条件を満たすものがあるか（水の判定などに使う）

## 入力（`src/player/input.js`）
| 操作 | キー |
|---|---|
| 前後左右 | W/S/A/D（矢印キーも可） |
| ジャンプ | Space |
| 下降（飛行中） | Shift |
| 走る | Ctrl |
| 視点 | マウス（ポインターロック中のみ） |

| 飛行の切り替え | Space を 300ms 以内に2回押す |
| ブロックを壊す | 左クリック |
| ブロックを置く | 右クリック |
| ホットバーの選択 | 1〜9、マウスホイール |
| デバッグ表示 | F3 |

- キー入力はポインターロック中だけ受け付ける。ロックが外れたら押しているキーをすべて離した扱いにする
- 2回押しの検出は `DoubleTapDetector`（`src/player/doubleTap.js`）。検出したら状態を戻すので、3回目の押下は新しい1回目になる
- 飛行の切り替え指示は `Input.pendingToggleFlight` に溜め、次のティックの `getControl()` で1回だけ `control.toggleFlight = true` として渡す

## スポーン（`src/world/spawn.js`）
- 原点から外側へ、4 ブロック間隔の正方形の輪で、地表が海面以上の場所を探す。見つかった地表の 1 つ上に立たせる

## メニュー（`src/ui/menu.js`）
- 起動時はメニューを表示した状態で始める。データの読み込みが終わると「開始」ボタンが押せるようになる
- ポインターロックに入るのは、メニューの「開始」/「ゲームに戻る」ボタンを押したときだけ（canvas をクリックしてもロックしない）
- Esc でロックが外れると（ブラウザ標準の動作）、`pointerlockchange` で検知してメニューを表示する。ボタンの文字は「ゲームに戻る」になる
- メニュー表示中はティックを進めない（ゲームが止まる）。チャンクの読み込みと描画は続ける
- `requestPointerLock()` が失敗したとき（Esc 直後の再ロックはブラウザに拒否されることがある）は、メニューにもう一度押すよう表示する
- 自動テスト用: `window.__game.simulateLock(true/false)` でロック状態を再現できる（自動操作のブラウザではポインターロックが使えないことがあるため）

## 設定（`src/ui/settings.js`、`settings.json`）
- 設定項目はデータで定義し、メニューの設定画面はこの定義から自動で作る
- 項目はキーをキーにしたオブジェクトで書く（配列だと上書きパックで1項目だけ変えられないため）。表示順は `order`
  ```json
  { "items": {
      "renderDistance": { "order": 1, "label": "描画距離", "type": "range", "min": 2, "max": 16, "step": 1, "default": 6, "unit": "チャンク" },
      "tickRate": { "order": 4, "label": "ティックレート", "type": "select", "options": [20, 30, 60], "default": 20, "unit": "回/秒" }
  } }
  ```
- 種類: `range`（`min` / `max` / `step` / `default`）、`select`（`options` / `default`）、`toggle`（`default` が boolean）
- 値は `coerceSetting` で定義に合うように直す（範囲に収め、刻みに合わせ、選択肢にない値は既定値）
- 値は localStorage の `boxel-game.settings` に JSON で保存する。読めない・壊れている値は無視する
- `Settings.subscribe(fn)` は登録時に現在の全ての値で1回ずつ呼ぶので、初期値の反映と変更時の反映を同じ関数で行える

| キー | 反映先 |
|---|---|
| `renderDistance` | 描画距離とフォグ |
| `fov` | カメラの視野角 |
| `mouseSensitivity` | マウス感度（1.0 で 0.0025 ラジアン/ピクセル） |
| `tickRate` | ティックレート |

## ブロックの選択・破壊・設置
- レイキャスト（`src/player/raycast.js`）: DDA 法でカメラの位置から視線方向へセルを1つずつ進め、最初に対象となるブロックと、当たった面の外向き法線を返す。届く距離は 5 ブロック
- 対象: 空気と液体以外（液体は通り抜けるので、水中のブロックも選べる）
- 選択中のブロックは黒い枠線（`EdgesGeometry`）で示す
- 破壊（`breakBlock`）: `breakable: false` のブロック（岩盤）は壊せない
- 設置（`placeBlock`）: 当たった面の隣のマスに置く。置けるのは空気か液体のマスだけ。固体ブロックは、当たり判定を持つエンティティと重なる場所には置けない（液体などの固体でないブロックは置ける）

## HUD（`src/ui/hud.js`）
- クロスヘア、ホットバー、デバッグ表示（F3）。メニュー表示中は隠す
- ホットバーの各スロットには、ブロックの南面（+Z）のテクスチャをアトラスから切り出して表示する
- デバッグ表示: FPS、ティックレート、座標、チャンク座標、読み込み・メッシュ化済みのチャンク数、三角形数、描画呼び出し数、飛行・接地の状態、シード

## 水の描画と判定
- 水と溶岩は静的（流れない）。プレイヤーが置くことも壊すこともできる
- 溶岩: 不透明に描く液体（`translucent: false`）。中に入ると橙色のフォグ（0.2〜3 ブロック）。動き（浮く・沈む）は水と同じ waterPhysics で、ダメージはまだない（体力の仕組みがないため）
- 見た目: 半透明（opacity 0.7）、両面描画、`depthWrite: false`。水面（上が液体でも固体でもない水ブロック）は高さ 0.875 に下げる
- 液体の中かどうか（`liquidAt`、`src/physics/liquid.js`）: 点のあるブロックが液体なら液体の中。ただし水面のブロックは、見た目に合わせて高さ 0.875 までを液体とする
- 水中の見た目: 毎フレーム、カメラの位置が液体の中なら、その液体の `fog` をシーンのフォグと背景色に使う（水: `#1d4a8c`、0.5〜14 ブロック）。外に出たら空のフォグに戻す

## データの読み込みとキャッシュ
- ブラウザでの JSON の読み込みは `fetch(path, { cache: 'no-cache' })`。毎回サーバーに更新を確認するので、データを編集したあとに古い内容が使われることがない（変更がなければ 304 で済む）
