#!/bin/sh
# 최초 기동 시 1회 실행 (mysql 볼륨이 비어 있을 때만)
set -e

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS alertlab DEFAULT CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS ops DEFAULT CHARACTER SET utf8mb4;

-- Spring 앱: alertlab 읽기/쓰기
CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON alertlab.* TO 'app'@'%';

-- n8n 진단: 읽기 전용 (정해둔 진단 쿼리만 실행)
CREATE USER IF NOT EXISTS 'n8n_diag'@'%' IDENTIFIED BY '${DIAG_DB_PASSWORD}';
GRANT SELECT ON alertlab.* TO 'n8n_diag'@'%';
GRANT SELECT ON performance_schema.* TO 'n8n_diag'@'%';
GRANT PROCESS ON *.* TO 'n8n_diag'@'%';

-- n8n 운영 상태: ops 스키마만
CREATE USER IF NOT EXISTS 'n8n_ops'@'%' IDENTIFIED BY '${OPS_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.* TO 'n8n_ops'@'%';

CREATE TABLE IF NOT EXISTS ops.alert_dedup (
    fingerprint      VARCHAR(64)  NOT NULL PRIMARY KEY,
    alertname        VARCHAR(128) NOT NULL,
    last_analyzed_at DATETIME     NOT NULL
);

-- 1.5단계(Slack 스레드)용
CREATE TABLE IF NOT EXISTS ops.alert_thread (
    fingerprint VARCHAR(64) NOT NULL PRIMARY KEY,
    channel     VARCHAR(64) NOT NULL,
    ts          VARCHAR(32) NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

FLUSH PRIVILEGES;
SQL
