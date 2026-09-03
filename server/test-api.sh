#!/usr/bin/env bash
# EventCart API smoke test — run from WSL/Git Bash with server on http://localhost:3000
# Usage: chmod +x test-api.sh && ./test-api.sh
# Requires: curl, jq (sudo apt install jq)

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== EventCart API test ==="
echo "Base URL: $BASE_URL"
echo

# --- 1. Register test customer ---
echo ">> Register customer"
REGISTER=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "email": "customer@test.com",
    "password": "TestPass123"
  }')
echo "$REGISTER" | jq .

TOKEN=$(echo "$REGISTER" | jq -r '.accessToken')
USER_ID=$(echo "$REGISTER" | jq -r '.user.id')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Register failed (email may already exist). Trying login..."
  LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "customer@test.com",
      "password": "TestPass123"
    }')
  echo "$LOGIN" | jq .
  TOKEN=$(echo "$LOGIN" | jq -r '.accessToken')
  USER_ID=$(echo "$LOGIN" | jq -r '.user.id')
fi

echo "TOKEN saved (customer)"
echo

# --- 2. Auth me ---
echo ">> GET /auth/me"
curl -s "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo

# --- 3. Create test products (no auth required currently) ---
echo ">> Create product 1"
PRODUCT1=$(curl -s -X POST "$BASE_URL/products" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Event T-Shirt",
    "slug": "event-t-shirt",
    "description": "Cotton tee for the event",
    "price": 24.99,
    "stock": 100
  }')
echo "$PRODUCT1" | jq .
PRODUCT1_ID=$(echo "$PRODUCT1" | jq -r '.id')

echo ">> Create product 2"
PRODUCT2=$(curl -s -X POST "$BASE_URL/products" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Event Mug",
    "slug": "event-mug",
    "description": "Ceramic mug",
    "price": 12.50,
    "stock": 50
  }')
echo "$PRODUCT2" | jq .
PRODUCT2_ID=$(echo "$PRODUCT2" | jq -r '.id')
echo

# --- 4. List products (Redis cache — run twice, check server logs for cache hit) ---
echo ">> GET /products (1st — cache miss)"
curl -s "$BASE_URL/products?page=1&limit=20" | jq '.meta'
echo ">> GET /products (2nd — should be cache hit)"
curl -s "$BASE_URL/products?page=1&limit=20" | jq '.meta'
echo

# --- 5. Cart flow ---
echo ">> Add items to cart"
curl -s -X POST "$BASE_URL/cart/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"productId\": \"$PRODUCT1_ID\", \"quantity\": 2}" | jq .

curl -s -X POST "$BASE_URL/cart/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"productId\": \"$PRODUCT2_ID\", \"quantity\": 1}" | jq .

echo ">> GET /cart"
curl -s "$BASE_URL/cart" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo

# --- 6. Checkout (creates order from cart) ---
echo ">> POST /cart/checkout"
ORDER=$(curl -s -X POST "$BASE_URL/cart/checkout" \
  -H "Authorization: Bearer $TOKEN")
echo "$ORDER" | jq .
ORDER_ID=$(echo "$ORDER" | jq -r '.id')
ORDER_NUMBER=$(echo "$ORDER" | jq -r '.orderNumber')
echo "Order: $ORDER_NUMBER ($ORDER_ID)"
echo

# --- 7. List & get order ---
echo ">> GET /orders"
curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ">> GET /orders/:id"
curl -s "$BASE_URL/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo

# --- 8. Direct order (alternative to cart) ---
echo ">> POST /orders (direct, without cart)"
curl -s -X POST "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\": [{\"productId\": \"$PRODUCT2_ID\", \"quantity\": 1}]}" | jq .
echo

echo "=== Done ==="
echo "Customer token (for manual tests): $TOKEN"
echo
echo "To test ADMIN order status update:"
echo "  1. Promote a user to ADMIN in Postgres:"
echo "     UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'admin@test.com';"
echo "  2. Register admin: curl -X POST $BASE_URL/auth/register -H 'Content-Type: application/json' -d '{\"name\":\"Test Admin\",\"email\":\"admin@test.com\",\"password\":\"TestPass123\"}'"
echo "  3. Login as admin, then:"
echo "     curl -X PATCH $BASE_URL/orders/$ORDER_ID/status -H 'Authorization: Bearer <ADMIN_TOKEN>' -H 'Content-Type: application/json' -d '{\"status\":\"CONFIRMED\",\"note\":\"Payment received\"}'"
