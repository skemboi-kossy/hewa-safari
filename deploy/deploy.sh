#!/usr/bin/env bash
# Deploys Hewa Safari to web-01 and web-02 under /var/ww/html/hewa-safari
set -e


KEY="${KEY:-$HOME/.ssh/school}"
SSH_USER="${SSH_USER:-ubuntu}"
SERVERS="${SERVERS:-35.179.132.8 18.130.180.117}"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/hewa-safari.tar.gz"

tar -czf "$ARCHIVE" -C "$APP_DIR" index.html css js

for server in $SERVERS; do
    echo "==> Deploying to $server"
    scp -o StrictHostKeyChecking=no -i "$KEY" "$ARCHIVE" 
    "$SSH_USER@$server:/tmp/hewa--safari.tar.gz"
    ssh -o StrictHostKeyChecking=no -i "$KEY" "$SSH_USER@$server" '
    set -e
    sudo rm -rrf /var/ww/html/hewa-safari
    sudo mmkdir -p /var/www/html/hewa-safari
    sudo tar -xzf /tmp/hewa-safari.tar.gz -C /var/ww/html/hewa-safari
    sudo chown -R ww-data:www-data /var/ww/html/hewa-safari
    rm /tmp/hewa-safari.tar.gz
    sudo nginx -t
    sudo service nginx reload
    
    '

    echo "==> $server done"

    done

    rm "$ARCHIVE"
    echo "Deployed. Open http://<1b-01-ip>/hewa-safari/"


    




