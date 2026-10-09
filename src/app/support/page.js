import DocPage from "@/components/DocPage";
import SupportCard from "@/components/SupportCard";

export const metadata = {
  title: "サポート | Kiri",
  description: "Kiri（Mind & Energy Note）のよくある質問とお問い合わせ",
};

export default function SupportPage() {
  return (
    <DocPage title="サポート" updatedAt="2026-10-09">
      <section>
        <h2>よくある質問</h2>
        <div className="space-y-4 mt-2">
          <div>
            <p className="font-bold text-white mb-1">Q. 記録はどこに保存されますか？</p>
            <p>
              この端末の中にのみ保存されます（ウェブ版はブラウザ内、iOSアプリはアプリ内の保存領域。
              iOSアプリの保存領域は、端末のバックアップ（iCloudなど）の対象になる場合があります）。
              サーバーにアカウントやデータベースはありません。
              Kiri側での自動バックアップは行われず、機種変更やブラウザのデータ削除・アプリの削除で消えるため、
              ホーム画面右上の設定アイコンの「バックアップ」を選択して、定期的にJSONファイルへ
              書き出しておくことをおすすめします。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. 記録を自分で削除するには？</p>
            <p>
              ホーム画面右上の設定アイコンの「すべて削除」から、この端末の記録を削除できます。
              iOSアプリは、アプリそのものを端末から削除しても、アプリ内の保存領域のデータが消えます。
              ウェブ版は、ブラウザのサイトデータを削除すると消えます。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. 記録が消えてしまいました。</p>
            <p>
              バックアップファイルがあれば、ホーム画面右上の設定アイコンの「バックアップ」→「読み込む」から復元できます。
              読み込みは今ある記録を消さず、足りない分だけ追加します。
              バックアップがない場合、消えたデータの復元はできません。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. アプリのロックとは？（iOSアプリ）</p>
            <p>
              iOSアプリでは、設定アイコンの「アプリのロック」をオンにすると、アプリを開くときに
              Face ID・Touch ID・端末のパスコードで確認します。Kiri専用の合言葉はないので、忘れて開けなくなることはありません。
              アプリを閉じてから自動でロックするまでの時間（すぐに／1分／5分／15分）と、アプリの切り替え画面で記録をぼかすかを選べます。
            </p>
            <p className="mt-2">
              守れるのは「画面を他の人に見られること」です。端末を貸したときや、置いたまま離れたときに記録を開かれにくくなります。
              一方で、端末のパスコードを知っている人は開けます。また、端末の中の保存データそのもの、
              iCloudなどの端末のバックアップ、書き出したバックアップファイルの中身は、ロックをオンにしても変わりません。
              バックアップファイルは誰でも中身を読める形なので、保管場所や送り先にご注意ください。
              端末のパスコードを外した場合、ロックは一時的に外れます（その旨をアプリ内でお知らせします）。ウェブ版にはロックはありません。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. 同じ日にもう一度占うと、結果が同じなのはなぜですか？</p>
            <p>
              仕様です。同じ日・同じ記録に対しては同じ読み解きを返すことで、
              その日の結果として安心して振り返れるようにしています。記録の内容を変えると読み解きも変わります。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. Kiriとの対話が使えません。</p>
            <p>
              Kiriとの自由な対話は有料機能として準備中で、現在は開発プレビューです。
              提供が始まるまでお待ちください。
            </p>
          </div>
          <div>
            <p className="font-bold text-white mb-1">Q. 占いの結果がつらく感じられます。</p>
            <p>
              Kiriの言葉は傾向を映す読み物であり、あなたの未来や価値を決めるものではありません。
              心がつらいときは、占いではなく人に頼ってください。厚生労働省の
              「まもろうよ こころ」（https://www.mhlw.go.jp/mamorouyokokoro/）に、
              電話・SNSで相談できる窓口がまとまっています。
            </p>
            <div className="mt-3">
              <SupportCard compact />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>お問い合わせ</h2>
        <p>
          お問い合わせ窓口: <a href="mailto:info@kugainc.com" className="underline">info@kugainc.com</a>（くうが株式会社（KUGA K.K.））<br />
          不具合の報告の際は、お使いの端末・ブラウザと、起きたことをできる範囲でお知らせください。
        </p>
      </section>
    </DocPage>
  );
}
