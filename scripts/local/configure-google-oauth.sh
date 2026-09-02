#!/usr/bin/env bash
set -euo pipefail
umask 077
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
secret_dir="$root_dir/.local-secrets"
mkdir -p "$secret_dir"; chmod 700 "$secret_dir"
printf 'Google OAuth client ID (input hidden): '
IFS= read -r -s client_id; printf '\n'
printf 'Google OAuth client secret (input hidden): '
IFS= read -r -s client_secret; printf '\n'
[[ -n "$client_id" && -n "$client_secret" ]] || { echo 'Both values are required.' >&2; exit 1; }
[[ "$client_id" =~ ^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$ ]] || { echo 'Client ID format is invalid. Copy the Desktop OAuth client ID exactly, without quotes or spaces.' >&2; exit 1; }
[[ "$client_secret" =~ ^GOCSPX-[A-Za-z0-9_-]+$ || "$client_secret" =~ ^[A-Za-z0-9_-]{20,}$ ]] || { echo 'Client secret format is invalid. Copy it exactly, without quotes or spaces.' >&2; exit 1; }
printf '%s' "$client_id" >"$secret_dir/google-client-id"
printf '%s' "$client_secret" >"$secret_dir/google-client-secret"
chmod 600 "$secret_dir/google-client-id" "$secret_dir/google-client-secret"
unset client_id client_secret
echo 'Google OAuth references stored locally with mode 0600.'
