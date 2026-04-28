# Ubuntu Server 構築記録（自宅）

## 環境
- マシン: MacBook Pro A1708（13インチ、2016/2017年、Touch Barなし）
- OS: Ubuntu Server 24.04 LTS
- 用途: 勉強用DBサーバー（PostgreSQL）

## ネットワーク
- 接続方式: Wi-Fi（BCM4350）
- 固定IP: `192.168.11.63`
- ゲートウェイ: `192.168.11.1`
- SSH接続: `ssh seto@192.168.11.63`

## インストール済みソフトウェア
- PostgreSQL 18（自動起動設定済み）
- OpenSSH Server
- fonts-terminus（コンソールフォント拡大用）

## 設定済み内容

### Wi-Fi固定IP設定
ファイル: `/etc/netplan/50-cloud-init.yaml`
```yaml
network:
  version: 2
  wifis:
    wlp2s0:
      dhcp4: false
      addresses:
        - 192.168.11.63/24
      routes:
        - to: default
          via: 192.168.11.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
      access-points:
        "WiFi名":
          password: "パスワード"
```

### コンソールフォント設定
ファイル: `/etc/vconsole.conf`
```
FONT=Uni2-TerminusBold32x16
```

### PostgreSQL基本操作
```bash
# PostgreSQLに接続
sudo -u postgres psql

# DB一覧表示
\l

# 終了
\q
```

## 次にやること

### 優先度高
1. **PostgreSQLの基本操作を学ぶ**
   - ユーザー作成
   - データベース作成
   - テーブル作成・CRUD操作
   - バックアップ

2. **My FavoritesページとDBの連携（将来的に）**
   - APIサーバー作成（Node.js or Python）
   - PostgreSQLにデータ設計
   - 外部アクセス設定（ポート開放）
   - フロントエンド修正

### 参考コマンド
```bash
# サーバー起動確認
sudo systemctl status postgresql

# IP確認
ip a

# 再起動
sudo reboot
```

## 注意点
- A1708のRetinaディスプレイは解像度変更が難しい（諦め推奨）
- SSHメインで操作するため物理画面の解像度は重要ではない
- Wi-FiドライバはBCM4350で認識済み
