# OVERVIEW

全体の処理の流れを、「呼び出す関数」とその中で呼び出す関数のツリーで示す。

## ファイル構成
```
src/core/constants.js   定数
src/core/packLoader.js  データパックの読み込みと深いマージ
src/core/registry.js    定義の検証、数値IDとテーブルの構築
data/packs.json         有効なパックの一覧
data/packs/base/        基本のデータパック（ブロック定義、テクスチャ、ホットバー）
tests/                  node:test のテスト
```

## 処理の流れ
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
