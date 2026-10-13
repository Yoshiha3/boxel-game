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
src/world/noise.js      シード付きノイズ、ハッシュ、乱数
src/world/chunk.js      チャンクのデータ構造と座標変換
src/world/terrain.js    地形の生成器
src/render/mesher.js    面カリング付きのメッシュ生成（純粋関数）
src/render/chunkRenderer.js メッシュデータから three.js のメッシュを作る
src/world/world.js      読み込み済みチャンクの管理、ブロックの取得・設定、読み込みと破棄
src/render/worldRenderer.js World と ChunkRenderer をつなぐ毎フレームの処理
src/world/spawn.js      スポーン地点の決定
src/core/tickClock.js   固定ステップのティック
src/physics/aabb.js     AABB とボクセルの衝突判定
src/entities/entity.js  エンティティ
src/entities/entityManager.js エンティティの更新と移動
src/entities/components/ コンポーネント（playerControl, waterPhysics, flight, walk, gravity, collision）
src/player/input.js     キーボード・マウス・ポインターロック
src/player/doubleTap.js キーの2回押しの検出
src/ui/settings.js      設定値の検証・保存・通知
src/ui/menu.js          メニュー画面と設定画面
src/physics/liquid.js   液体の判定（水面の高さを考慮）
src/player/raycast.js   ボクセルのレイキャスト（純粋関数）
src/player/blockActions.js ブロックの破壊・設置のルール（純粋関数）
src/player/interaction.js 選択枠の表示と、マウスによる破壊・設置
src/ui/hud.js           クロスヘア、ホットバー、デバッグ表示
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
  readSeed()                            URL の ?seed=
  createTerrainGenerator(seed, worldgen, registry)
  new World(registry, terrain)
  new WorldRenderer(world, chunkRenderer, tileUVs)
  new EntityManager(world, registry)
  entities.spawn('player', findSpawn(terrain))
    resolveComponents(def)              既定値を補う
    orderedComponentNames(components)   実行順
  new Input(canvas)
  new TickClock(tickRate)
  new Settings(defs.settings, localStorage)
  settings.subscribe(applySetting)      描画距離・視野角・感度・ティックレートを反映
  new Menu(settings, onResume)
    buildSettings(container)            settings.json から入力欄を作る
  new Hud(registry, atlasCanvas, hotbarSlots)
  new BlockInteraction(scene, world, entities)
  [左クリック] interaction.breakTarget()
    breakBlock(world, pos)
      world.setBlock(x, y, z, AIR)                 dirty → 次のフレームでメッシュを作り直す
  [右クリック] interaction.placeAtTarget(hud.selectedBlock)
    placeBlock(world, pos, id, entities)          エンティティと重ならないか確認
  [1〜9 / ホイール] hud.select(index)
  [開始 / ゲームに戻る ボタン]
    input.requestLock()                 失敗したら menu.setMessage()
  [pointerlockchange]
    input.setLocked(locked)
      menu.hide() / menu.show()
  requestAnimationFrame(frame)
    frame(now)
      clock.advance(elapsed)                      実行するティック数（メニュー表示中は 0）
      input.getControl()                          キー状態 + 溜めた飛行切り替え（consumeToggleFlight）
      entities.update(dt, input)                  ティックごと
        updateEntity(e, ctx)
          COMPONENTS[name].update(e, params, ctx) order 順（playerControl → waterPhysics → flight → walk → gravity）
            liquidAt(...)                         waterPhysics: 液体の判定、沈む・浮上・跳ねる・壁登り
          integrate(e, dt, isSolid)
            moveWithCollision(isSolid, pos, size, delta)
              sweepAxis()                         Y → X → Z
      player.interpolatedPos(clock.alpha)         カメラ位置
      updateViewFog(camera.position)              水中なら液体の fog に切り替える
        liquidAt(getBlock, registry.liquid, x, y, z)
      worldRenderer.update(x, z, renderDistance)
        world.update(cx, cz, R, maxLoads)         近い順に生成、遠いものを破棄
          world.loadChunk(cx, cz)
            generator.generate(chunk)
        chunkRenderer.removeChunk(key)            破棄・範囲外のメッシュを外す
        world.takeChunksToMesh(cx, cz, R, max)    隣が揃った dirty チャンク
        buildChunkMeshData(chunk, ..., world.neighborLookup(chunk))
        chunkRenderer.setChunkMesh(...)
      interaction.update(camera)                  視線の先のブロックと選択枠
        raycast(isTarget, origin, dir, REACH)
      renderer.render(scene, camera)
      hud.setDebugLines(...)                      F3 表示中のみ
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

### 地形の生成
```
createTerrainGenerator(seed, worldgen, registry)
  createNoise2D(seed) / createNoise2D(seed + 1)
  generate(chunk)                       チャンクを地形で埋める
    heightAt(x, z)                      地表の高さ
      baseHeightAt(x, z)                川を作る前の高さ
        fbm2D(heightNoise, x, z, height)
        hillNoise(x, z)
      riverNoise(x, z)                  川の帯で地表を平らな川底へ下げる（標高が高いほど弱める）
    chunk.set(x, y, z, id)              岩盤・石・土・草・砂（水中・砂浜）・水
```

### チャンクのメッシュ生成
```
buildChunkMeshData(chunk, registry, tileUVs, getNeighbor)
  blockAt(x, y, z)                      チャンク外は getNeighbor
  isFaceHidden(registry, b, n)          隣で隠れる面は出さない
  addFace(buf, ...)                     4頂点と2三角形を追加
chunkRenderer.setChunkMesh(key, cx, cz, meshData)
  createGeometry(data)                  opaque / cutout / liquid ごとに Mesh を作る
chunkRenderer.removeChunk(key)          geometry.dispose()
```
