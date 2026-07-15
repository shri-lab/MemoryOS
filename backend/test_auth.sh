#!/bin/bash

# Ensure we are in the script's directory
cd "$(dirname "$0")"

echo "=== Cleaning up database first ==="
.venv/bin/python3 cleanup_test_user.py

echo "=== Starting uvicorn ==="
.venv/bin/uvicorn main:app --port 8000 --reload &
UVICORN_PID=$!

# Wait for uvicorn to start
sleep 3

echo ""
echo "=== 1. Register a new user ==="
REG_RESPONSE=$(curl -s -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}')
echo "Response: $REG_RESPONSE"

echo ""
echo "=== 2. Registering the same email again fails ==="
FAIL_REG_CODE=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}')
echo "HTTP Status Code (expected 409): $FAIL_REG_CODE"

echo ""
echo "=== 3. Login with correct password ==="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}')
echo "Response: $LOGIN_RESPONSE"

# Extract token using python or simple parsing
TOKEN=$(.venv/bin/python3 -c "import json; print(json.loads('''$LOGIN_RESPONSE''').get('access_token', ''))" 2>/dev/null)
echo "Extracted Token: $TOKEN"

echo ""
echo "=== 4. Login with wrong password ==="
FAIL_LOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpass"}')
echo "HTTP Status Code (expected 401): $FAIL_LOGIN_CODE"

echo ""
echo "=== 5. /auth/me with a valid token ==="
if [ -n "$TOKEN" ]; then
  ME_RESPONSE=$(curl -s http://localhost:8000/auth/me \
    -H "Authorization: Bearer $TOKEN")
  echo "Response: $ME_RESPONSE"
else
  echo "Failed to get token in step 3!"
fi

echo ""
echo "=== 6. /auth/me with no token ==="
NO_TOKEN_CODE=$(curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/auth/me)
echo "HTTP Status Code (expected 401): $NO_TOKEN_CODE"

echo ""
echo "=== Stopping uvicorn ==="
kill $UVICORN_PID
wait $UVICORN_PID 2>/dev/null
echo "=== Test finished ==="
