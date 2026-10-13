# OVERVIEW

全体の処理の流れを、「呼び出す関数」とその中で呼び出す関数のツリーで示す。

## ファイル構成
```
index.html              importmap（three.js を CDN から）、エントリー
src/main.js             起動処理とゲームループ
src/core/constants.js   定数
src/core/dataLoader.js  ブラウザ用: fetch でパックを読みレジストリを作る
src/render/atlas.js     テクスチャ PNG を読み込み、アトラスを作る
src/render/atlasLayout.js アトラスの配置と UV の計算（純粋関数）
tools/gen-textures.mjs  base パックのテクスチャ PNG を生成する
src/core/packLoader.js  データパックの読み込みと深いマージ
src/core/registry.js    定義の検証、数値IDとテーブルの構築
data/packs.json         有効なパックの一覧
data/packs/base/        基本のデータパック（ブロック定義、テクスチャ、ホットバー）
tests/                  node:test のテスト
```

## 処理の流れ
### 起動
```
main()
  loadRegistry()                        fetch で data/packs.json とパックを読む
    loadPacks(fetchJson, packNames)     （下の「データの読み込み」）
    buildRegistry(defs)
  createRenderer(container)
  buildTextureAtlas(registry)           PNG を canvas に並べて CanvasTexture にする
    loadImage(path)
    buildTileUVs(count)                 タイル番号 → UV の表
  requestAnimationFrame(frame)
    frame()                             毎フレーム描画
```

### データの読み込み
```
loadPacks(readJson, packNames)          パックを順に読み込み、マージした定義セットを返す
  readJson("data/packs/<name>/pack.json")
  readJson(各定義ファイル)
    resolveAssetPaths(data, packDir)    .png のパスをパックからの相対パスに解決
  mergePackInto(defs, files)
    deepMerge(prev, data)               同じ id は後のパックで上書き
buildRegistry(defs)                     検証してレジストリを作る
  validateBlocks() / validateHotbar()
  new Registry(defs)
    normalizeBlock(def)                 既定値を補う
    faceTexturePaths(textures)          6面のテクスチャを決め、タイル番号を振る
```
