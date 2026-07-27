import DocPage from "@/components/DocPage";

export const metadata = {
  title: "サポート | Kiri",
  description: "Kiri（Mind & Energy Note）のよくある質問とお問い合わせ",
};

export default function SupportPage() {
  return (
    <DocPage title="サポート" updatedAt="2026-07-28">
      <section>
        <h2>よくある質問</h2>
        <div className="space-y-4 mt-2">
          <div>
            <p className="font-bold text-white">Q. 記録はどこに保存されますか？</p>
            <p>
              この端末のブラウザ内にのみ保存されます。サーバーにアカウントやデータベースはありません。
              バックアップは自動では行われず、機種変更やブラウザのデータ削除で消えるため、
              ホーム画面右上の設定アイコンの「バックアップ」を選択して、定期的にJSONファイルへ
              書き出しておくことをおすすめします。
            </p>
          </div>
          <div>
            <p className="font-bold text-white">Q. 記録が消えてしまいました。</p>
            <p>
              バックアップファイルがあれば、ホーム画面右上の設定アイコンの「バックアップ」→「読み込む」から復元できます。
              読み込みは今ある記録を消さず、足りない分だけ追加します。
              バックアップがない場合、消えたデータの復元はできません。
            </p>
          </div>
          <div>
            <p className="font-bold text-white">Q. 同じ日にもう一度占うと、結果が同じなのはなぜですか？</p>
            <p>
              仕様です。同じ日・同じ記録に対しては同じ読み解きを返すことで、
              その日の結果として安心して振り返れるようにしています。記録の内容を変えると読み解きも変わります。
            </p>
          </div>
          <div>
            <p className="font-bold text-white">Q. Kiriとの対話が使えません。</p>
            <p>
              Kiriとの自由な対話は有料機能として準備中で、現在は開発プレビューです。
              提供が始まるまでお待ちください。
            </p>
          </div>
          <div>
            <p className="font-bold text-white">Q. 占いの結果がつらく感じられます。</p>
            <p>
              Kiriの言葉は傾向を映す読み物であり、あなたの未来や価値を決めるものではありません。
              心がつらいときは、占いではなく人に頼ってください。厚生労働省の
              「まもろうよ こころ」（https://www.mhlw.go.jp/mamorouyokokoro/）に、
              電話・SNSで相談できる窓口がまとまっています。
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>お問い合わせ</h2>
        <p>
          お問い合わせ窓口: （公開前に確定します）<br />
          不具合の報告の際は、お使いの端末・ブラウザと、起きたことをできる範囲でお知らせください。
        </p>
      </section>
    </DocPage>
  );
}
