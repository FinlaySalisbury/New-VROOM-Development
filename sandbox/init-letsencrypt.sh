#!/bin/bash
# ═══════════════════════════════════════════════════════════
# init-letsencrypt.sh
# 
# Run this ONCE on the VM to obtain the initial SSL certificate.
# After that, the certbot container auto-renews every 12 hours.
# ═══════════════════════════════════════════════════════════
set -e

DOMAIN="yuroute.com"
EMAIL="yu007637@yunextraffic.com"  # Change this to your email

echo "==> Creating required directories..."
mkdir -p certbot/conf certbot/www

echo "==> Starting nginx with HTTP-only config for ACME challenge..."
# Temporarily replace the SSL config with HTTP-only for initial cert
cat > nginx/nginx-temp.conf <<'EOF'
server {
    listen 80;
    server_name yuroute.com www.yuroute.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Setting up SSL...';
        add_header Content-Type text/plain;
    }
}
EOF

# Start nginx with temp config
sudo docker compose run -d --name nginx-temp \
    -v "$(pwd)/nginx/nginx-temp.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$(pwd)/certbot/www:/var/www/certbot:ro" \
    -p 80:80 \
    nginx

echo "==> Requesting certificate from Let's Encrypt..."
sudo docker run --rm \
    -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
    -v "$(pwd)/certbot/www:/var/www/certbot" \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

echo "==> Stopping temporary nginx..."
sudo docker stop nginx-temp
sudo docker rm nginx-temp
rm -f nginx/nginx-temp.conf

echo "==> Certificate obtained! Starting full stack..."
sudo docker compose up -d --build

echo ""
echo "✅ HTTPS is now live at https://$DOMAIN"
echo "   Certificates will auto-renew every 12 hours."
