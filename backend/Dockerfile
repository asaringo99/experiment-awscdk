# ベースイメージとしてNode.jsを使用
FROM node:20

# アプリケーションディレクトリを作成
WORKDIR /usr/src/app

# 必要なファイルをコピー
COPY package*.json yarn.lock ./

# 依存関係をインストール
RUN npm install

# アプリケーションのソースをコピー
COPY . .

EXPOSE 80

# アプリケーションを開始
CMD ["node", "server.js"]
