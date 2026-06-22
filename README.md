# Relation Sprint

英検1級スピーチ用の「2者間の関係」を示す全66例文を、瞬間英作文で暗記するためのブラウザアプリです。

## 開き方

`index.html` をダブルクリックしてください。未ログインでも利用でき、進捗はブラウザの `localStorage` に保存されます。Supabase設定後はログインしたアカウントにも同期されます。

ローカルサーバーで開く場合:

```sh
python3 -m http.server 4173 --directory relation-english
```

## 学習機能

- 日本語から英語を作る「声に出す」「入力する」の2モード
- 4段階の自己採点に基づく間隔反復
- 全66例文の検索・章フィルター・定着状況
- 24パターンと元資料の注意点、重要表現一覧
- 英文読み上げ、キーボードショートカット
- 学習進捗のJSON書き出し・読み込み
- Supabase Authによるメールログインと複数端末同期
- オフライン継続と、再接続後の自動同期

## Supabaseの設定

1. Supabaseでプロジェクトを作成します。
2. SQL Editorで `supabase/migrations/202606230001_create_user_progress.sql` を実行します。
3. `config.js` にProject URLとpublishable key（またはanon key）を設定します。
4. AuthenticationのSite URLとRedirect URLsに公開URLを登録します。

`service_role` keyはRLSを迂回する秘密鍵なので、`config.js`やGitHubへ入れないでください。

## GitHub Pages

`.github/workflows/pages.yml` が `main` ブランチへのpushを自動公開します。GitHubリポジトリの Settings → Pages → Source は「GitHub Actions」を選択してください。

## 元資料を再抽出する

同梱の `extract_docx.py` は、元DOCXから `data.js` を再生成します。`python-docx` が必要です。
