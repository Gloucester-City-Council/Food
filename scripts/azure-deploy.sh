#!/usr/bin/env bash
#
# Azure CLI Deployment Commands for GCC Food Inspection System
#
# This script provisions the required Azure resources and deploys the
# application as an Azure Static Web App with Azure Functions API backend
# and Azure Database for PostgreSQL Flexible Server.
#
# Prerequisites:
#   - Azure CLI (az) installed and authenticated
#   - GitHub repository connected
#
# Usage:
#   chmod +x scripts/azure-deploy.sh
#   ./scripts/azure-deploy.sh
#
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-gcc-food-inspection-rg}"
LOCATION="${LOCATION:-uksouth}"
SWA_NAME="${SWA_NAME:-gcc-food-inspection-app}"
PG_SERVER_NAME="${PG_SERVER_NAME:-gcc-food-inspection-db}"
PG_ADMIN_USER="${PG_ADMIN_USER:-pgadmin}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD}"
PG_DATABASE="${PG_DATABASE:-food_inspections}"
PG_SKU="${PG_SKU:-Standard_B1ms}"
GITHUB_REPO="${GITHUB_REPO}"      # e.g. "Gloucester-City-Council/Food"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

# ─── Validation ─────────────────────────────────────────────────────────────
if [ -z "${PG_ADMIN_PASSWORD:-}" ]; then
  echo "ERROR: PG_ADMIN_PASSWORD is required."
  echo "Usage: PG_ADMIN_PASSWORD='YourStr0ngP@ss!' GITHUB_REPO='org/repo' ./scripts/azure-deploy.sh"
  exit 1
fi
if [ -z "${GITHUB_REPO:-}" ]; then
  echo "ERROR: GITHUB_REPO is required (e.g. 'Gloucester-City-Council/Food')."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Azure Deployment - GCC Food Inspection System              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Resource Group ────────────────────────────────────────────────
echo "▸ Step 1: Creating resource group '${RESOURCE_GROUP}' in '${LOCATION}'..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo "  ✓ Resource group created."

# ─── Step 2: PostgreSQL Flexible Server ────────────────────────────────────
echo "▸ Step 2: Creating PostgreSQL Flexible Server '${PG_SERVER_NAME}'..."
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PG_SERVER_NAME" \
  --location "$LOCATION" \
  --admin-user "$PG_ADMIN_USER" \
  --admin-password "$PG_ADMIN_PASSWORD" \
  --sku-name "$PG_SKU" \
  --tier Burstable \
  --version 16 \
  --storage-size 32 \
  --yes \
  --output none
echo "  ✓ PostgreSQL server created."

echo "  Creating database '${PG_DATABASE}'..."
az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$PG_SERVER_NAME" \
  --database-name "$PG_DATABASE" \
  --output none
echo "  ✓ Database created."

# Allow Azure services to connect
echo "  Configuring firewall for Azure services..."
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PG_SERVER_NAME" \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none
echo "  ✓ Firewall configured."

# Build the connection string
PG_HOST="${PG_SERVER_NAME}.postgres.database.azure.com"
DATABASE_URL="postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_HOST}:5432/${PG_DATABASE}?sslmode=require"
echo "  Connection string: postgresql://${PG_ADMIN_USER}:***@${PG_HOST}:5432/${PG_DATABASE}?sslmode=require"

# ─── Step 3: Static Web App ───────────────────────────────────────────────
echo "▸ Step 3: Creating Static Web App '${SWA_NAME}'..."
az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --source "https://github.com/${GITHUB_REPO}" \
  --branch "$GITHUB_BRANCH" \
  --app-location "/frontend" \
  --api-location "/api" \
  --output-location "" \
  --login-with-github \
  --output none
echo "  ✓ Static Web App created."

# ─── Step 4: Configure Application Settings ───────────────────────────────
echo "▸ Step 4: Configuring application settings (environment variables)..."
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names \
    "DATABASE_URL=${DATABASE_URL}" \
    "DB_SSL=true" \
    "UNIFORM_HOST=${UNIFORM_HOST:-127.0.0.1}" \
    "UNIFORM_PORT=${UNIFORM_PORT:-445}" \
    "UNIFORM_API_KEY=${UNIFORM_API_KEY:-}" \
    "UNIFORM_USERNAME=${UNIFORM_USERNAME:-}" \
    "UNIFORM_PASSWORD=${UNIFORM_PASSWORD:-}" \
  --output none
echo "  ✓ Application settings configured."

# ─── Step 5: Display information ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Deployment Summary"
echo "═══════════════════════════════════════════════════════════════"

SWA_URL=$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostname" \
  --output tsv 2>/dev/null || echo "pending")

echo "  Resource Group:     ${RESOURCE_GROUP}"
echo "  Location:           ${LOCATION}"
echo "  Static Web App:     ${SWA_NAME}"
echo "  App URL:            https://${SWA_URL}"
echo "  PostgreSQL Server:  ${PG_HOST}"
echo "  Database:           ${PG_DATABASE}"
echo ""
echo "  Next Steps:"
echo "  1. Run the migration script to populate PostgreSQL:"
echo "     DATABASE_URL='${DATABASE_URL}' node scripts/migrate-sqlite-to-postgres.js"
echo "  2. Push code to GitHub to trigger CI/CD deployment."
echo "  3. Verify at https://${SWA_URL}"
echo "═══════════════════════════════════════════════════════════════"
