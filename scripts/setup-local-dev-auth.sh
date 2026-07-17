#!/usr/bin/env bash
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# One-shot local OIDC auth setup for portal + Keycloak smoke.
# Run from the repo root:
#   bash scripts/setup-local-dev-auth.sh
#
# Then restart the API and portal (this script does not kill your processes).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Writing backend .env"
cat > .env <<'EOF'
DATABASE_DSN=admin:admin@tcp(localhost:3306)/custos?parseTime=true&charset=utf8mb4&multiStatements=true
OIDC_ISSUER_URL=http://localhost:8081/realms/custos
OIDC_AUDIENCE=custos-api
CUSTOS_CLUSTER_ID=00000000-0000-0000-0000-000000000001
CUSTOS_BOOTSTRAP_ADMIN_EMAIL=admin@custos.local
AMIE_BASE_URL=http://localhost:8180
AMIE_SITE_CODE=TESTSITE
AMIE_API_KEY=dev
AMIE_CLUSTER_ID=00000000-0000-0000-0000-000000000001
EOF

echo "==> Writing web/.env.local"
cat > web/.env.local <<'EOF'
NODE_ENV=development
NEXTAUTH_SECRET=dev-secret-at-least-8-chars
NEXTAUTH_URL=http://localhost:3000
CUSTOS_CORE_API_BASE_URL=http://localhost:8080
OIDC_ISSUER_URL=http://localhost:8081/realms/custos
OIDC_CLIENT_ID=portal
OIDC_CLIENT_SECRET=portal-dev-secret
NEXT_PUBLIC_PORTAL_USE_MSW=false
NEXT_PUBLIC_PORTAL_BUILD_SHA=dev
EOF

echo "==> Applying DB seeds"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx custos_db; then
  docker exec -i custos_db mariadb -uadmin -padmin custos < dev-ops/compose/seeds/default_cluster.sql
  docker exec -i custos_db mariadb -uadmin -padmin custos < dev-ops/compose/seeds/dev_users_and_roles.sql
  echo "    applied via docker exec custos_db"
elif command -v mysql >/dev/null 2>&1; then
  mysql -uadmin -padmin -h127.0.0.1 custos < dev-ops/compose/seeds/default_cluster.sql
  mysql -uadmin -padmin -h127.0.0.1 custos < dev-ops/compose/seeds/dev_users_and_roles.sql
  echo "    applied via local mysql client"
else
  echo "ERROR: neither custos_db container nor mysql client found" >&2
  exit 1
fi

echo "==> Checking Keycloak realm"
if ! curl -sf http://localhost:8081/realms/custos/.well-known/openid-configuration >/dev/null; then
  echo "WARNING: Keycloak not reachable on :8081"
  echo "         start it with: (cd dev-ops/compose && docker compose up -d keycloak)"
else
  echo "    Keycloak OK"
fi

echo "==> Checking seeded admin user"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx custos_db; then
  docker exec custos_db mariadb -uadmin -padmin custos -e \
    "SELECT id,email,status FROM users WHERE email='admin@custos.local'; SELECT user_id,source,oidc_sub FROM user_identities WHERE user_id='dev-admin';"
else
  mysql -uadmin -padmin -h127.0.0.1 custos -e \
    "SELECT id,email,status FROM users WHERE email='admin@custos.local'; SELECT user_id,source,oidc_sub FROM user_identities WHERE user_id='dev-admin';"
fi

cat <<'EOF'

Done. Next (in separate terminals):

  # terminal 1 — API (must pick up .env)
  set -a && source .env && set +a
  go run ./cmd/server

  # terminal 2 — portal
  cd web && pnpm dev

Then sign in at http://localhost:3000 with admin / admin
EOF
